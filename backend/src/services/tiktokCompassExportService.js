const { sequelize } = require('../models');
const { withCompassLock } = require('./tiktokCompassLockService');
const { recordRunEvent } = require('./scheduledRunMonitorService');
const { hashKey, compassWaitError, isCompassRateLimitError } = require('./tiktokCompassRequestService');

const taskMatchesExport = (task, spec) => String(task.module_type || '').toUpperCase() === spec.moduleType
  && String(task.window_type || '').toUpperCase() === spec.windowType
  && Number(task.end_day) === Number(spec.endDay)
  && (spec.moduleType === 'BASE' || String(task.plan_type || '').toUpperCase() === spec.planType);

const reconcileCompassTask = async (spec, listTasks) => {
  let pageToken;
  for (let page = 0; page < 20; page += 1) {
    const payload = await listTasks({ docType: spec.moduleType, pageSize: 100, pageToken });
    const rows = payload?.data?.tasks || payload?.data?.offline_tasks || payload?.data?.task_list || [];
    const task = rows.find((row) => (row.id || row.task_id) && taskMatchesExport(row, spec));
    if (task) return { taskId: String(task.id || task.task_id), requestId: payload.request_id || null };
    pageToken = payload?.data?.next_page_token;
    if (!pageToken) break;
  }
  // An absent match does not prove creation failed (eventual consistency, limited
  // retention, or a list response without the full export parameters).
  throw Object.assign(compassWaitError(Date.now() + 900000, 'TIKTOK_COMPASS_UNCERTAIN'), {
    message: 'Compass task creation has an unknown outcome; no exact task match is available yet. Task creation will not be repeated.',
  });
};

const ensureCompassExport = async (spec, {
  findExisting, saveExport, createTask, listTasks, db = sequelize, withLock = withCompassLock,
}) => {
  const requestKey = hashKey([
    String(process.env.TIKTOK_PARTNER_APP_KEY || '').trim(), spec.shopId,
    spec.moduleType, spec.planType, spec.windowType, Number(spec.endDay),
  ]);
  const outcome = await withLock(db, requestKey, 81429, async (lockedDb) => {
    try {
      // All cooperating workers check local exports while holding the same lock.
      const existing = await findExisting();
      if (existing) {
        await recordRunEvent('TASK_REUSED', { status: 'INFO', task_id: existing.task_id, message: `Reusing ${existing.status} export.` });
        // Historical FAILED rows can represent a transient list/download error.
        // Recheck their remote task rather than creating a replacement.
        if (existing.status === 'FAILED') await existing.update({ status: 'PROCESSING', completed_at: null });
        return { value: existing };
      }
      const [intents] = await lockedDb.query('SELECT * FROM tiktok_compass_export_intents WHERE request_key = :key', {
        replacements: { key: requestKey },
      });
      const intent = intents[0];
      let taskId = intent?.task_id;
      let requestId = intent?.request_id;
      if (!taskId && ['CREATING', 'UNKNOWN'].includes(intent?.status)) {
        await recordRunEvent('TASK_RECONCILING', { status: 'PROCESSING', message: 'Looking up an earlier task with unknown creation outcome.' });
        ({ taskId, requestId } = await reconcileCompassTask(spec, listTasks));
      }
      if (!taskId) {
        // Autocommit before HTTP; a crash after this must go through reconciliation.
        await lockedDb.query(`INSERT INTO tiktok_compass_export_intents (request_key, status)
          VALUES (:key, 'CREATING') ON CONFLICT (request_key) DO UPDATE
          SET status = 'CREATING', updated_at = NOW()`, { replacements: { key: requestKey } });
        try {
          const payload = await createTask();
          taskId = payload?.data?.task?.id || payload?.data?.task_id;
          requestId = payload?.request_id || null;
          if (!taskId) throw Object.assign(new Error('TikTok Compass did not return a task id.'), { compassRetryable: true, requestOutcomeUnknown: true });
        } catch (error) {
          // A local limiter rejection or explicit API rejection did not create a
          // task. Network/5xx/malformed-success outcomes must be reconciled.
          const rejected = ['TIKTOK_COMPASS_WAIT', 'TIKTOK_COMPASS_COOLDOWN'].includes(error.code)
            || isCompassRateLimitError(error)
            || (!error.requestOutcomeUnknown && !error.compassRetryable && !(error.httpStatus >= 500));
          await lockedDb.query(`UPDATE tiktok_compass_export_intents
            SET status = :status, error = :error, updated_at = NOW() WHERE request_key = :key`, {
            replacements: { key: requestKey, status: rejected ? 'NEW' : 'UNKNOWN', error: String(error.message).slice(0, 2000) },
          });
          throw error;
        }
      }
      await lockedDb.query(`UPDATE tiktok_compass_export_intents
        SET status = 'CREATED', task_id = :taskId, request_id = :requestId, error = NULL, updated_at = NOW()
        WHERE request_key = :key`, { replacements: { key: requestKey, taskId: String(taskId), requestId } });
      await recordRunEvent('TASK_READY', { status: 'SUCCEEDED', task_id: String(taskId), request_id: requestId });
      return { value: await saveExport(String(taskId), requestId) };
    } catch (error) {
      return { error };
    }
  });
  if (outcome.busy) throw compassWaitError(Date.now() + 5000);
  if (outcome.error) throw outcome.error;
  return outcome.value;
};

module.exports = { ensureCompassExport, reconcileCompassTask, taskMatchesExport };
