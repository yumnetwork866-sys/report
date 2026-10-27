const { startWorker } = require('../worker');

startWorker().catch((error) => {
  console.error('[Worker] Failed to start:', error);
  process.exitCode = 1;
});
