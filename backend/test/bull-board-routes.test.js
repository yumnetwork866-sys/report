const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/index');
const { createSessionToken } = require('../src/lib/session');
const { closeAllQueuesAndWorkers } = require('../src/lib/queue');
const { closeRedis } = require('../src/lib/redis');
const { stopTiktokSyncWorker } = require('../src/workers/tiktokSyncWorker');

test('Bull-Board dashboard admin role authentication and cookie session', async (t) => {
  t.after(async () => {
    await stopTiktokSyncWorker();
    await closeAllQueuesAndWorkers();
    await closeRedis();
  });

  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-12345678901234567890';

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // 1. Unauthenticated request should return 401 without basic auth challenge
  const unauthRes = await fetch(`http://127.0.0.1:${port}/admin/queues`);
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.headers.get('www-authenticate'), null);

  // 2. Non-admin user token should return 403
  const userToken = createSessionToken({ id: 2, role: 'user' });
  const userRes = await fetch(`http://127.0.0.1:${port}/admin/queues/?token=${encodeURIComponent(userToken)}`);
  assert.equal(userRes.status, 403);

  // 3. Request with valid Admin Bearer token via query param should succeed and set cookie
  const adminToken = createSessionToken({ id: 1, role: 'admin' });
  const adminRes = await fetch(`http://127.0.0.1:${port}/admin/queues/?token=${encodeURIComponent(adminToken)}`);
  assert.ok([200, 301, 302].includes(adminRes.status));
  const setCookie = adminRes.headers.get('set-cookie');
  assert.ok(setCookie?.includes('bull_admin_token='));

  // 4. Request with cookie should succeed without query param
  const cookieRes = await fetch(`http://127.0.0.1:${port}/admin/queues/`, {
    headers: {
      Cookie: `bull_admin_token=${encodeURIComponent(adminToken)}`,
    },
  });
  assert.ok([200, 301, 302].includes(cookieRes.status));
});
