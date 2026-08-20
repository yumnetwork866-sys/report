const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/index');
const { createSessionToken } = require('../src/lib/session');
const { closeAllQueuesAndWorkers } = require('../src/lib/queue');
const { closeRedis, checkRedisHealth } = require('../src/lib/redis');
const { stopTiktokSyncWorker } = require('../src/workers/tiktokSyncWorker');

test('Queue management REST API routes', async (t) => {
  t.after(async () => {
    await stopTiktokSyncWorker();
    await closeAllQueuesAndWorkers();
    await closeRedis();
  });

  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    t.diagnostic('Redis server not reachable, skipping live queue route tests');
    return;
  }

  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-12345678901234567890';

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const adminToken = createSessionToken({ id: 1, role: 'admin' });

  // 1. GET /api/queues
  const res = await fetch(`http://127.0.0.1:${port}/api/queues`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.queues));
  assert.ok(data.counts);
  assert.ok(Array.isArray(data.jobs));

  // 2. POST /api/queues/tiktok-sync/test-job
  const testJobRes = await fetch(`http://127.0.0.1:${port}/api/queues/tiktok-sync/test-job`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jobKey: 'test_action',
      data: { hello: 'world' },
    }),
  });
  assert.equal(testJobRes.status, 200);
  const testJobData = await testJobRes.json();
  assert.ok(testJobData.jobId);

  // 3. POST /api/queues/tiktok-sync/clean
  const cleanRes = await fetch(`http://127.0.0.1:${port}/api/queues/tiktok-sync/clean`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'completed' }),
  });
  assert.equal(cleanRes.status, 200);
});
