process.env.PROCESS_ROLE = process.env.PROCESS_ROLE || 'worker';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const { sequelize } = require('./models');
const { startDatabaseScheduler } = require('./services/scheduledJobService');
const { refreshAppCache } = require('./services/tiktokAppService');
const { closeAllQueuesAndWorkers } = require('./lib/queue');
const { closeRedis } = require('./lib/redis');

const startWorker = async () => {
  await sequelize.authenticate();
  await refreshAppCache();
  const scheduler = startDatabaseScheduler();
  console.info('[Worker] Scheduler and queue worker started');

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[Worker] Received ${signal}, shutting down gracefully...`);
    scheduler.stop();
    await Promise.allSettled([
      closeAllQueuesAndWorkers(),
      closeRedis(),
    ]);
    await sequelize.close().catch(() => {});
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return { scheduler, shutdown };
};

if (require.main === module) {
  startWorker().catch(async (error) => {
    console.error('[Worker] Failed to start:', error);
    await Promise.allSettled([
      closeAllQueuesAndWorkers(),
      closeRedis(),
      sequelize.close(),
    ]);
    process.exitCode = 1;
  });
}

module.exports = { startWorker };
