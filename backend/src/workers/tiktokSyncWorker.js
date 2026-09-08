const { createWorker, addJob } = require('../lib/queue');
const { delByPattern } = require('../lib/redis');
const { ScheduledJobRun } = require('../models');
const { withRunMonitor } = require('../services/scheduledRunMonitorService');

const TIKTOK_SYNC_QUEUE = 'tiktok-sync';

let workerInstance = null;

const registeredHandlers = new Map();

// Built-in test handlers for verification/smoke testing
registeredHandlers.set('test', async ({ data = {} } = {}) => ({
  status: 'ok',
  message: 'Test job completed successfully',
  timestamp: new Date().toISOString(),
  data,
}));
registeredHandlers.set('test_action', async ({ data = {} } = {}) => ({
  status: 'ok',
  message: 'Test action completed successfully',
  timestamp: new Date().toISOString(),
  data,
}));
registeredHandlers.set('ping', async () => ({
  status: 'ok',
  message: 'pong',
  timestamp: new Date().toISOString(),
}));

/**
 * Register a handler for a jobKey
 * @param {string} key
 * @param {Function} handler
 */
const registerJobHandler = (key, handler) => {
  registeredHandlers.set(key, handler);
};

/**
 * Register multiple handlers
 * @param {object} handlers
 */
const registerJobHandlers = (handlers = {}) => {
  for (const [key, handler] of Object.entries(handlers)) {
    registeredHandlers.set(key, handler);
  }
};

/**
 * Initialize TikTok Sync Queue Worker
 * @param {object} handlers Map of job handlers by jobKey
 * @param {object} options Worker options (concurrency, etc.)
 * @returns {Worker}
 */
const startTiktokSyncWorker = (handlers = {}, options = {}) => {
  registerJobHandlers(handlers);
  const queueName = options.queueName || TIKTOK_SYNC_QUEUE;

  if (workerInstance && !workerInstance.closing && !workerInstance.closed && !options.queueName) {
    return workerInstance;
  }

  const worker = createWorker(
    queueName,
    async (job) => {
      const jobKey = job.data?.jobKey || job.name;
      const data = job.data?.data || (job.data?.jobKey ? {} : job.data) || {};
      const runId = data.runId || job.data?.runId;
      const handler = registeredHandlers.get(jobKey);

      if (!handler) {
        throw new Error(`No sync handler registered for jobKey: "${jobKey}"`);
      }

      await job.updateProgress(10);

      let runRecord = null;
      // Resumable handlers own their run state, including RETRY_PENDING and
      // conditional claims. A duplicate delivery must not mark that run done.
      if (runId && ScheduledJobRun && !handler.managesRunStatus) {
        try {
          runRecord = await ScheduledJobRun.findByPk(runId);
        } catch {}
      }

      const controller = new AbortController();
      let result;
      try {
        if (runId) {
          const { registerActiveRunController } = require('../services/scheduledJobService');
          registerActiveRunController(runId, controller);
        }
        result = await withRunMonitor({ run_id: runId, attempt: (job.attemptsMade || 0) + 1 },
          () => handler({ ...data, signal: controller.signal, job }));
      } catch (err) {
        const isAborted = err.name === 'AbortError' || controller.signal.aborted || /stopped by user|abort/i.test(String(err.message || ''));
        if (runRecord) {
          try {
            await runRecord.reload();
            if (['PROCESSING', 'RETRY_PENDING'].includes(runRecord.status)) {
              await runRecord.update({
                status: isAborted ? 'CANCELLED' : 'FAILED',
                summary: err.summary || null,
                error: isAborted ? 'Stopped by user.' : String(err.message || err).slice(0, 4000),
                completed_at: new Date(),
              });
            }
          } catch {}
        }
        if (isAborted) {
          return {
            jobKey,
            completedAt: new Date().toISOString(),
            status: 'CANCELLED',
            stopped: true,
          };
        }
        throw err;
      } finally {
        if (runId) {
          const { unregisterActiveRunController } = require('../services/scheduledJobService');
          unregisterActiveRunController(runId);
        }
      }

      await job.updateProgress(90);

      // Invalidate relevant Redis caches on completion
      await Promise.all([
        delByPattern('dashboard:*'),
        delByPattern('report:*'),
        delByPattern('videos:*'),
        delByPattern('bookings:*'),
      ]).catch(() => {});

      if (runRecord) {
        try {
          await runRecord.reload();
          if (runRecord.status === 'PROCESSING') {
            await runRecord.update({
              status: 'SUCCEEDED',
              summary: result || null,
              completed_at: new Date(),
              error: null,
            });
          }
        } catch {}
      }

      await job.updateProgress(100);

      return {
        jobKey,
        completedAt: new Date().toISOString(),
        summary: result || null,
      };
    },
    {
      concurrency: options.concurrency || 1, // default 1 job at a time to prevent TikTok rate limit
      ...options,
    },
  );

  if (!options.queueName) {
    workerInstance = worker;
  }

  return worker;
};

/**
 * Dispatch a sync job to the BullMQ queue
 * @param {string} jobKey
 * @param {object} data
 * @param {object} opts
 * @returns {Promise<Job>}
 */
const queueSyncJob = async (jobKey, data = {}, opts = {}) => {
  const queueName = opts.queueName || TIKTOK_SYNC_QUEUE;
  return addJob(
    queueName,
    jobKey,
    { jobKey, data },
    {
      jobId: opts.jobId || `${jobKey}-${Date.now()}`,
      attempts: opts.attempts || 3,
      backoff: opts.backoff || {
        type: 'exponential',
        delay: 10000, // 10s initial delay on error
      },
      ...opts,
    },
  );
};

const stopTiktokSyncWorker = async () => {
  if (workerInstance) {
    await workerInstance.close().catch(() => {});
    workerInstance = null;
  }
};

module.exports = {
  TIKTOK_SYNC_QUEUE,
  startTiktokSyncWorker,
  stopTiktokSyncWorker,
  registerJobHandler,
  registerJobHandlers,
  queueSyncJob,
};
