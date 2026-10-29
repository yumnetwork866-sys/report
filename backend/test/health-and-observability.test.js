const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createHealthRouter } = require('../src/routes/healthRoutes');
const {
  requestTelemetry,
  recordDatabaseQuery,
  formatHttpLogLine,
  formatDbSlowQueryLine,
  colorizeStatus,
  formatResponseSize,
  ANSI,
} = require('../src/lib/requestTelemetry');
const { createFixedWindowRateLimit } = require('../src/middleware/rateLimit');

const listen = async (app, t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
};

test('health is live-only and readiness reports dependency state', async (t) => {
  let databaseChecks = 0;
  const app = express();
  app.use(createHealthRouter({
    database: { query: async () => { databaseChecks += 1; return [{ '?column?': 1 }]; } },
    redisHealth: async () => true,
  }));
  const baseUrl = await listen(app, t);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  assert.equal(databaseChecks, 0);

  const ready = await fetch(`${baseUrl}/ready`);
  assert.equal(ready.status, 200);
  const payload = await ready.json();
  assert.equal(payload.status, 'ready');
  assert.equal(payload.checks.postgres.ok, true);
  assert.equal(payload.checks.redis.ok, true);
  assert.equal(databaseChecks, 1);
});

test('readiness returns 503 without exposing dependency errors', async (t) => {
  const app = express();
  app.use(createHealthRouter({
    database: { query: async () => { throw new Error('secret connection details'); } },
    redisHealth: async () => false,
  }));
  const baseUrl = await listen(app, t);
  const response = await fetch(`${baseUrl}/ready`);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.status, 'not_ready');
  assert.equal(payload.checks.postgres.reason, 'unavailable');
  assert.doesNotMatch(JSON.stringify(payload), /secret connection details/);
});

test('request telemetry propagates request id and records database work', async (t) => {
  const app = express();
  app.use(requestTelemetry);
  app.get('/measured', (req, res) => {
    recordDatabaseQuery(12.5);
    res.json({ request_id: req.requestId });
  });
  const baseUrl = await listen(app, t);
  const response = await fetch(`${baseUrl}/measured`, { headers: { 'x-request-id': 'test-request-42' } });

  assert.equal(response.headers.get('x-request-id'), 'test-request-42');
  assert.equal((await response.json()).request_id, 'test-request-42');
});

test('fixed-window limiter returns 429 with retry metadata', async (t) => {
  const app = express();
  app.use(createFixedWindowRateLimit({ max: 1, windowMs: 60_000, key: () => 'test' }));
  app.get('/', (_req, res) => res.sendStatus(204));
  const baseUrl = await listen(app, t);

  assert.equal((await fetch(baseUrl)).status, 204);
  const blocked = await fetch(baseUrl);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('HTTP telemetry compact log formatter formats one-line log with ANSI colors and warnings', () => {
  // Test 1: Standard 200 OK request (uncolored)
  const line = formatHttpLogLine({
    method: 'GET',
    path: '/api/tiktok-apps/active',
    statusCode: 200,
    durationMs: 10.4,
    responseBytes: 1844,
    dbQueryCount: 5,
    dbDurationMs: 11.0,
    isSlow: false,
    useColor: false,
  });
  assert.equal(line, '[HTTP] GET /api/tiktok-apps/active 200 10.4ms | 1.8KB | DB: 5q (11.0ms)');

  // Test 2: Slow request adds ⚠️ icon
  const slowLine = formatHttpLogLine({
    method: 'GET',
    path: '/api/tiktok-shop/shops',
    statusCode: 200,
    durationMs: 320.5,
    responseBytes: 7754,
    dbQueryCount: 8,
    dbDurationMs: 240.0,
    isSlow: true,
    useColor: false,
  });
  assert.equal(slowLine, '[HTTP] ⚠️ GET /api/tiktok-shop/shops 200 320.5ms | 7.6KB | DB: 8q (240.0ms)');

  // Test 3: ANSI colors for 2xx, 3xx, 4xx, 5xx
  assert.equal(colorizeStatus(200, true), `${ANSI.green}200${ANSI.reset}`);
  assert.equal(colorizeStatus(304, true), `${ANSI.cyan}304${ANSI.reset}`);
  assert.equal(colorizeStatus(401, true), `${ANSI.yellow}401${ANSI.reset}`);
  assert.equal(colorizeStatus(500, true), `${ANSI.red}500${ANSI.reset}`);

  // Test 4: Format response sizes
  assert.equal(formatResponseSize(500), '500B');
  assert.equal(formatResponseSize(2048), '2.0KB');
  assert.equal(formatResponseSize(1048576 * 2.5), '2.5MB');
  assert.equal(formatResponseSize(null), '-');
});

test('DB slow query compact formatter formats one-line log with duration, request id, and process role', () => {
  // Moderate slow query (< 1000ms, uncolored)
  const line1 = formatDbSlowQueryLine({
    durationMs: 256.4,
    requestId: '74065e08-2edd-451f-8bb4-72e09b1da8b8',
    processRole: 'api',
    useColor: false,
  });
  assert.equal(line1, '[DB] ⚠️ Slow query: 256.4ms | req: 74065e08-2edd-451f-8bb4-72e09b1da8b8 | process: api');

  // Severe slow query (>= 1000ms, uncolored) without request ID
  const line2 = formatDbSlowQueryLine({
    durationMs: 1290,
    requestId: null,
    processRole: 'worker',
    useColor: false,
  });
  assert.equal(line2, '[DB] ⚠️ Slow query: 1290.0ms | req: - | process: worker');

  // With optional SQL query text
  const line3 = formatDbSlowQueryLine({
    durationMs: 500,
    requestId: 'req-123',
    processRole: 'api',
    query: 'SELECT * FROM bookings WHERE id = ?',
    useColor: false,
  });
  assert.equal(line3, '[DB] ⚠️ Slow query: 500.0ms | req: req-123 | process: api | sql: SELECT * FROM bookings WHERE id = ?');

  // Colorization: yellow for < 1000ms, red for >= 1000ms
  const coloredYellow = formatDbSlowQueryLine({
    durationMs: 400,
    requestId: 'test',
    processRole: 'api',
    useColor: true,
  });
  assert.ok(coloredYellow.includes(`${ANSI.yellow}400.0ms${ANSI.reset}`));

  const coloredRed = formatDbSlowQueryLine({
    durationMs: 1500,
    requestId: 'test',
    processRole: 'api',
    useColor: true,
  });
  assert.ok(coloredRed.includes(`${ANSI.red}1500.0ms${ANSI.reset}`));
});
