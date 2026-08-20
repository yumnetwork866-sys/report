const test = require('node:test');
const assert = require('node:assert/strict');
const { startTiktokSyncWorker, stopTiktokSyncWorker, queueSyncJob } = require('../src/workers/tiktokSyncWorker');
const { getQueueEvents, closeAllQueuesAndWorkers } = require('../src/lib/queue');
const { checkRedisHealth, setCache, getCache, closeRedis } = require('../src/lib/redis');

test('tiktokSyncWorker processes queued sync jobs, updates progress and clears caches', async (t) => {
  t.after(async () => {
    await stopTiktokSyncWorker();
    await closeAllQueuesAndWorkers();
    await closeRedis();
  });

  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    t.diagnostic('Redis server not reachable, skipping live worker test');
    return;
  }

  process.env.ENABLE_TEST_CACHE = 'true';

  // Set dummy cache keys to verify purge
  await setCache('dashboard:test:1', { a: 1 }, 60);
  await setCache('report:test:1', { b: 2 }, 60);

  let handlerExecuted = false;
  let receivedData = null;

  const handlers = {
    test_sync_action: async ({ sampleId, job }) => {
      handlerExecuted = true;
      receivedData = sampleId;
      assert.ok(job);
      return { syncedCount: 42 };
    },
  };

  const testQueue = `test-sync-${Date.now()}`;
  const worker = startTiktokSyncWorker(handlers, { concurrency: 1, queueName: testQueue });
  assert.ok(worker);

  const events = getQueueEvents(testQueue);
  const job = await queueSyncJob('test_sync_action', { sampleId: 'shop-99' }, { attempts: 1, queueName: testQueue });
  assert.ok(job.id);

  // Wait for job completion
  const result = await job.waitUntilFinished(events, 5000);
  assert.equal(result.jobKey, 'test_sync_action');
  assert.deepEqual(result.summary, { syncedCount: 42 });
  assert.equal(handlerExecuted, true);
  assert.equal(receivedData, 'shop-99');

  // Verify cache was purged
  const dashboardCache = await getCache('dashboard:test:1');
  const reportCache = await getCache('report:test:1');
  assert.equal(dashboardCache, null);
  assert.equal(reportCache, null);
});
