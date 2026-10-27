const {
  Op, fn, col, QueryTypes,
} = require('sequelize');
const {
  sequelize, ScheduledJob, ScheduledJobRun, ScheduledJobRunEvent, TikTokShop,
} = require('../models');
const {
  JOB_KEYS,
  normalizeRunTimes,
  assertTimezone,
  enqueueScheduledJob,
  stopScheduledJob,
} = require('../services/scheduledJobService');

const compactRunSummary = (summary) => {
  if (!summary || typeof summary !== 'object') return summary;
  const { total, failed, succeeded, pending, results } = summary;
  const compacted = {};
  if (total !== undefined) compacted.total = total;
  if (failed !== undefined) compacted.failed = failed;
  if (succeeded !== undefined) compacted.succeeded = succeeded;
  if (pending !== undefined) compacted.pending = pending;

  if (Array.isArray(results)) {
    // Keep shop-level result items (with shop_name / shop_code / error) or failed items
    // Strip massive internal debug arrays and hundreds of successful video items
    const relevantResults = results.filter((r) => r && (r.shop_name || r.status === 'FAILED' || r.error));
    if (relevantResults.length) {
      compacted.results = relevantResults.slice(0, 30).map((r) => ({
        status: r.status,
        ...(r.shop_id ? { shop_id: r.shop_id } : {}),
        ...(r.shop_name ? { shop_name: r.shop_name } : {}),
        ...(r.shop_code ? { shop_code: r.shop_code } : {}),
        ...(r.error ? { error: typeof r.error === 'string' ? r.error : String(r.error) } : {}),
      }));
    }
  }
  return compacted;
};

const RECENT_RUN_LIMIT = 30;
const COMPACT_RUN_SUMMARY_SQL = `
  CASE
    WHEN run.summary IS NULL OR jsonb_typeof(run.summary) <> 'object' THEN run.summary
    ELSE
      (CASE WHEN run.summary ? 'total' THEN jsonb_build_object('total', run.summary->'total') ELSE '{}'::jsonb END)
      || (CASE WHEN run.summary ? 'failed' THEN jsonb_build_object('failed', run.summary->'failed') ELSE '{}'::jsonb END)
      || (CASE WHEN run.summary ? 'succeeded' THEN jsonb_build_object('succeeded', run.summary->'succeeded') ELSE '{}'::jsonb END)
      || (CASE WHEN run.summary ? 'pending' THEN jsonb_build_object('pending', run.summary->'pending') ELSE '{}'::jsonb END)
      || CASE
        WHEN jsonb_typeof(run.summary->'results') = 'array' THEN COALESCE((
          SELECT jsonb_build_object('results', jsonb_agg(projected.item ORDER BY projected.ordinality))
          FROM (
            SELECT
              result.ordinality,
              jsonb_strip_nulls(jsonb_build_object(
                'status', result.value->'status',
                'shop_id', result.value->'shop_id',
                'shop_name', result.value->'shop_name',
                'shop_code', result.value->'shop_code',
                'error', result.value->'error'
              )) AS item
            FROM jsonb_array_elements(run.summary->'results') WITH ORDINALITY AS result(value, ordinality)
            WHERE result.value ? 'shop_name'
              OR result.value->>'status' = 'FAILED'
              OR result.value ? 'error'
            ORDER BY result.ordinality
            LIMIT 30
          ) AS projected
        ), '{}'::jsonb)
        ELSE '{}'::jsonb
      END
  END
`;

const findRecentRunsForJobs = async (jobIds, database = sequelize) => {
  if (!jobIds.length) return [];
  return database.query(`
    SELECT
      run.id,
      run.scheduled_job_id,
      run.trigger_type,
      run.scheduled_key,
      run.next_retry_at,
      run.status,
      run.started_at,
      run.completed_at,
      ${COMPACT_RUN_SUMMARY_SQL} AS summary,
      run.error
    FROM unnest(ARRAY[:jobIds]::integer[]) AS selected_job(id)
    CROSS JOIN LATERAL (
      SELECT candidate.*
      FROM scheduled_job_runs AS candidate
      WHERE candidate.scheduled_job_id = selected_job.id
      ORDER BY candidate.started_at DESC
      LIMIT ${RECENT_RUN_LIMIT}
    ) AS run
    ORDER BY run.scheduled_job_id ASC, run.started_at DESC
  `, {
    replacements: { jobIds },
    type: QueryTypes.SELECT,
  });
};

const serializeJob = async (job, prefetchedRuns = null) => {
  const runs = prefetchedRuns || await findRecentRunsForJobs([job.id]);
  const compactedRuns = runs.map((run) => {
    const json = run.toJSON ? run.toJSON() : run;
    return {
      ...json,
      summary: compactRunSummary(json.summary),
    };
  });
  return { ...job.toJSON(), run_count: job.run_times.length, runs: compactedRuns };
};

const listSchedules = async (_req, res) => {
  try {
    const [jobs, shops] = await Promise.all([
      ScheduledJob.findAll({
        where: { job_key: { [Op.in]: [...JOB_KEYS] } },
        order: [['id', 'ASC']],
      }),
      TikTokShop.findAll({
        attributes: ['id', 'name', 'code', 'region'],
        order: [['id', 'ASC']],
      }),
    ]);
    const runs = await findRecentRunsForJobs(jobs.map((job) => job.id));
    const runsByJobId = new Map();
    for (const run of runs) {
      const jobId = Number(run.scheduled_job_id);
      if (!runsByJobId.has(jobId)) runsByJobId.set(jobId, []);
      runsByJobId.get(jobId).push(run);
    }
    res.json({
      schedules: await Promise.all(jobs.map((job) => serializeJob(job, runsByJobId.get(job.id) || []))),
      shops,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const runTimes = normalizeRunTimes(req.body?.run_times);
    const timezone = assertTimezone(req.body?.timezone);
    await job.update({
      enabled: Boolean(req.body?.enabled),
      timezone,
      run_times: runTimes,
      updated_at: new Date(),
    });
    res.json({ schedule: await serializeJob(job) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const runScheduleNow = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const rawShopId = req.body?.shop_id ?? req.query?.shop_id;
    const shopId = rawShopId !== undefined && rawShopId !== null && rawShopId !== '' ? Number(rawShopId) : null;
    const { run, created } = await enqueueScheduledJob(job, { shopId });
    res.status(created ? 202 : 409).json({ run, started: created });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const stopScheduleNow = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const run = await stopScheduledJob(job);
    if (!run) return res.status(409).json({ message: 'This job is not running.' });
    return res.json({ run, stopped: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const positiveId = (value) => /^[1-9]\d{0,18}$/.test(String(value || '')) && BigInt(value) <= 9223372036854775807n;
const MONITOR_STATUSES = new Set(['IN_FLIGHT', 'RECEIVED', 'SUCCEEDED', 'FAILED', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'RETRY_PENDING', 'INFO', 'PROCESSING', 'CANCELLED']);
const monitorWhere = (runId, query) => {
  const where = { run_id: runId };
  if (query.before_id) {
    if (!positiveId(query.before_id)) throw new Error('Invalid event cursor.');
    where.id = { [Op.lt]: String(query.before_id) };
  }
  if (query.status && query.status !== 'ALL') {
    if (query.status === 'ERRORS') where.status = { [Op.in]: ['FAILED', 'NETWORK_ERROR', 'INVALID_RESPONSE'] };
    else if (query.status === 'IN_FLIGHT') where.status = { [Op.in]: ['IN_FLIGHT', 'RECEIVED'] };
    else if (MONITOR_STATUSES.has(query.status)) where.status = query.status;
    else throw new Error('Invalid event status.');
  }
  if (query.shop_id) {
    if (!/^\d{1,10}$/.test(String(query.shop_id)) || Number(query.shop_id) > 2147483647) throw new Error('Invalid shop ID.');
    where.shop_id = Number(query.shop_id);
  }
  if (query.q) {
    const search = `%${String(query.q).slice(0, 200).replace(/[\\%_]/g, '\\$&')}%`;
    where[Op.or] = ['request_id', 'task_id', 'endpoint', 'message'].map((field) => ({ [field]: { [Op.iLike]: search } }));
  }
  return where;
};

const listRunEvents = async (req, res) => {
  let where;
  if (!positiveId(req.params.runId)) return res.status(400).json({ message: 'Invalid run ID.' });
  try { where = monitorWhere(req.params.runId, req.query); }
  catch (error) { return res.status(400).json({ message: error.message }); }
  try {
    const run = await ScheduledJobRun.findByPk(req.params.runId);
    if (!run) return res.status(404).json({ message: 'Run not found.' });
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
    const [rows, counts, latest] = await Promise.all([
      ScheduledJobRunEvent.findAll({
        where, order: [['id', 'DESC']], limit: limit + 1,
        attributes: { exclude: ['request_data', 'response_data', 'response_headers'] },
      }),
      ScheduledJobRunEvent.findAll({
        where: { run_id: run.id, event_type: 'API_REQUEST' },
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'], raw: true,
      }),
      ScheduledJobRunEvent.findOne({ where: { run_id: run.id }, order: [['updated_at', 'DESC']], attributes: ['updated_at'] }),
    ]);
    const stats = { requests: 0, succeeded: 0, failed: 0, in_flight: 0, last_activity_at: latest?.updated_at || null };
    for (const row of counts) {
      const count = Number(row.count);
      stats.requests += count;
      if (row.status === 'SUCCEEDED') stats.succeeded += count;
      else if (['IN_FLIGHT', 'RECEIVED'].includes(row.status)) stats.in_flight += count;
      else stats.failed += count;
    }
    const events = rows.slice(0, limit);
    return res.json({ run, stats, events, next_cursor: rows.length > limit ? String(events.at(-1).id) : null });
  } catch (error) { return res.status(500).json({ message: error.message }); }
};

const getRunEvent = async (req, res) => {
  if (!positiveId(req.params.runId) || !positiveId(req.params.eventId)) return res.status(400).json({ message: 'Invalid run or event ID.' });
  try {
    const event = await ScheduledJobRunEvent.findOne({ where: { id: req.params.eventId, run_id: req.params.runId } });
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    return res.json({ event });
  } catch (error) { return res.status(500).json({ message: error.message }); }
};

module.exports = {
  listSchedules,
  updateSchedule,
  runScheduleNow,
  stopScheduleNow,
  listRunEvents,
  getRunEvent,
  monitorWhere,
  findRecentRunsForJobs,
};
