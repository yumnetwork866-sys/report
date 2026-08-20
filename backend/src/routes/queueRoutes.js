const express = require('express');
const { getQueue } = require('../lib/queue');
const { TIKTOK_SYNC_QUEUE, queueSyncJob } = require('../workers/tiktokSyncWorker');

const router = express.Router();

const KNOWN_QUEUES = [
  {
    name: TIKTOK_SYNC_QUEUE,
    title: 'TikTok Sync Queue',
    description: 'Đồng bộ doanh thu, video, catalog sản phẩm, đơn affiliate và chỉ số kênh TikTok',
    concurrency: 1,
  },
];

/**
 * GET /api/queues
 * Returns queues summary and job list with status filter
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'ALL', queueName = TIKTOK_SYNC_QUEUE, limit = 50 } = req.query;

    const queue = getQueue(queueName);
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');

    let jobTypes;
    if (status === 'ALL') {
      jobTypes = ['active', 'waiting', 'failed', 'completed', 'delayed'];
    } else {
      jobTypes = [status.toLowerCase()];
    }

    const rawJobs = await queue.getJobs(jobTypes, 0, Math.min(Number(limit) || 50, 100), true);

    const jobs = rawJobs.map((job) => {
      const state = job.finishedOn
        ? (job.failedReason ? 'FAILED' : 'COMPLETED')
        : (job.processedOn ? 'PROCESSING' : 'WAITING');

      return {
        id: String(job.id),
        name: job.name,
        jobKey: job.data?.jobKey || job.name,
        data: job.data?.data || job.data || {},
        progress: Number(job.progress) || 0,
        status: state,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts || 1,
        failedReason: job.failedReason || null,
        stacktrace: job.stacktrace || [],
        createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        returnValue: job.returnvalue || null,
      };
    });

    res.json({
      queues: KNOWN_QUEUES.map((q) => ({
        ...q,
        counts: q.name === queueName ? counts : {},
      })),
      counts,
      jobs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/queues/:queueName/test-job
 * Enqueue a manual test job
 */
router.post('/:queueName/test-job', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { jobKey = 'tiktok_channel_report_revenue', data = {} } = req.body;

    const job = await queueSyncJob(jobKey, data, {
      queueName,
      attempts: 1,
    });

    res.json({ message: 'Job added successfully', jobId: job.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/queues/:queueName/retry-all-failed
 * Retry all failed jobs in queue
 */
router.post('/:queueName/retry-all-failed', async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = getQueue(queueName);
    const failedJobs = await queue.getJobs(['failed'], 0, 100);

    for (const job of failedJobs) {
      await job.retry().catch(() => {});
    }

    res.json({ message: `Retried ${failedJobs.length} failed jobs` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/queues/:queueName/clean
 * Clean completed or failed jobs
 */
router.post('/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { type = 'completed' } = req.body;
    const queue = getQueue(queueName);

    await queue.clean(0, 1000, type);

    res.json({ message: `Cleaned ${type} jobs successfully` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/queues/:queueName/jobs/:jobId/retry
 * Retry a specific job
 */
router.post('/:queueName/jobs/:jobId/retry', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    await job.retry();
    res.json({ message: 'Job retried successfully', jobId: job.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * DELETE /api/queues/:queueName/jobs/:jobId
 * Remove a specific job
 */
router.delete('/:queueName/jobs/:jobId', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    await job.remove();
    res.json({ message: 'Job removed successfully', jobId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
