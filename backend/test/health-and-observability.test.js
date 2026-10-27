const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createHealthRouter } = require('../src/routes/healthRoutes');
const { requestTelemetry, recordDatabaseQuery } = require('../src/lib/requestTelemetry');
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
