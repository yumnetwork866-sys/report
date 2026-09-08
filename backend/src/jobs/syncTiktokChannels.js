require('dotenv').config();

const { QueryTypes } = require('sequelize');
const { TikTokChannel, sequelize } = require('../models');
const { syncTiktokChannel } = require('../controllers/channelController');
const { withMonitorContext } = require('../services/scheduledRunMonitorService');

const JOB_LOCK_KEY = 'report:tiktok-daily-sync';
const configuredConcurrency = Number(process.env.TIKTOK_SYNC_CONCURRENCY || 3);
const SYNC_CONCURRENCY = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
  ? configuredConcurrency
  : 3;

const runWithConcurrency = async (items, limit, task) => {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await task(item);
    }
  });

  await Promise.all(workers);
};

const run = async ({ closeConnection = true } = {}) => {
  let lockAcquired = false;
  let failed = 0;
  let finalSummary = { channels: 0, succeeded: 0, failed: 0, skipped: false };

  try {
    await sequelize.transaction(async (transaction) => {
      const [lock] = await sequelize.query(
        'SELECT pg_try_advisory_xact_lock(hashtext(:lockKey)) AS acquired',
        {
          replacements: { lockKey: JOB_LOCK_KEY },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      lockAcquired = lock.acquired;

      if (!lockAcquired) {
        console.info('[TikTok Sync Job] Another sync job is already running; exiting.');
        finalSummary = { channels: 0, succeeded: 0, failed: 0, skipped: true };
        return;
      }

      const channels = await TikTokChannel.findAll({
        where: { sync_source: 'oauth' },
        order: [['id', 'ASC']],
      });
      const results = [];

      await runWithConcurrency(channels, SYNC_CONCURRENCY, async (channel) => {
        try {
          const summary = await withMonitorContext({ channel_id: channel.id }, () => syncTiktokChannel(channel));
          results.push({ channelId: channel.id, status: 'success', total: summary.total });
          console.info('[TikTok Sync Job] Channel synced', { channelId: channel.id, ...summary });
        } catch (error) {
          results.push({ channelId: channel.id, status: 'failed' });
          console.error('[TikTok Sync Job] Channel sync failed', {
            channelId: channel.id,
            message: error.message || String(error),
          });
        }
      });

      const succeeded = results.filter((result) => result.status === 'success').length;
      failed = results.length - succeeded;
      finalSummary = { channels: channels.length, succeeded, failed, skipped: false, results };
      console.info('[TikTok Sync Job] Completed', {
        channels: channels.length,
        succeeded,
        failed,
      });
    });
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }

  if (closeConnection && lockAcquired && failed > 0) {
    process.exitCode = 1;
  }
  return finalSummary;
};

if (require.main === module) {
  run().catch((error) => {
    console.error('[TikTok Sync Job] Failed', error);
    process.exitCode = 1;
  });
}

module.exports = { run };
