const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getQueue,
  addJob,
  createWorker,
  closeAllQueuesAndWorkers,
} = require('../src/lib/queue');
const { checkRedisHealth, closeRedis } = require('../src/lib/redis');

test('BullMQ queue adds and processes job via worker', async () => {
  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    return;
  }

  const testQueueName = `test-queue-${Date.now()}`;
  const queue = getQueue(testQueueName);
  assert.ok(queue);

  let processedData = null;
  const worker = createWorker(testQueueName, async (job) => {
    processedData = job.data;
    await job.updateProgress(100);
    return { success: true };
  }, { concurrency: 1 });

  const testPayload = { task: 'sync_test_videos', timestamp: Date.now() };
  const job = await addJob(testQueueName, 'sync_job', testPayload);
  assert.ok(job.id);

  let attempts = 0;
  while (!processedData && attempts < 50) {
    await new Promise((r) => setTimeout(r, 50));
    attempts += 1;
  }

  assert.deepEqual(processedData, testPayload);

  await worker.close();
  await queue.close();
  await closeAllQueuesAndWorkers();
  await closeRedis();
});
