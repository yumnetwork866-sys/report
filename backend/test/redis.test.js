const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCache,
  setCache,
  delCache,
  delByPattern,
  getOrSetCache,
  checkRedisHealth,
  closeRedis,
} = require('../src/lib/redis');

test('Redis connection, cache read/write, and getOrSetCache', async (t) => {
  process.env.ENABLE_TEST_CACHE = 'true';
  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    t.diagnostic('Redis server not reachable, skipping live tests');
    return;
  }

  const testKey = `test:healthcheck:${Date.now()}`;
  const payload = { message: 'hello redis', timestamp: Date.now(), items: [1, 2, 3] };

  // 1. setCache & getCache
  const setResult = await setCache(testKey, payload, 30);
  assert.equal(setResult, true);

  const cached = await getCache(testKey);
  assert.deepEqual(cached, payload);

  // 2. getOrSetCache (hit)
  let fetchCalled = false;
  const cachedHit = await getOrSetCache(testKey, 30, async () => {
    fetchCalled = true;
    return { shouldNotFetch: true };
  });
  assert.equal(cachedHit.hit, true);
  assert.deepEqual(cachedHit.data, payload);
  assert.equal(fetchCalled, false);

  // 3. delCache
  const delResult = await delCache(testKey);
  assert.equal(delResult, true);

  const afterDel = await getCache(testKey);
  assert.equal(afterDel, null);

  // 4. getOrSetCache (miss)
  const missedResult = await getOrSetCache(testKey, 30, async () => {
    fetchCalled = true;
    return { newlyFetched: 123 };
  });
  assert.equal(missedResult.hit, false);
  assert.deepEqual(missedResult.data, { newlyFetched: 123 });
  assert.equal(fetchCalled, true);

  // 5. delByPattern
  await setCache(`pattern:test:1`, { a: 1 }, 30);
  await setCache(`pattern:test:2`, { b: 2 }, 30);
  const deletedCount = await delByPattern('pattern:test:*');
  assert.ok(deletedCount >= 2);
  const pattern1 = await getCache('pattern:test:1');
  assert.equal(pattern1, null);

  // Cleanup
  await delCache(testKey);
});

test.after(async () => {
  await closeRedis();
});
