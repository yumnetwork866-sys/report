const test = require('node:test');
const assert = require('node:assert/strict');
const { withRunMonitor, withMonitorContext, monitoredFetch, sanitizePayload, recordRunEvent } = require('../src/services/scheduledRunMonitorService');

const capture = () => {
  const rows = new Map();
  return {
    rows,
    async writer(fields, id) {
      const key = id || String(rows.size + 1);
      rows.set(key, { ...rows.get(key), ...fields, id: key });
      return key;
    },
  };
};
const response = (payload, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (name) => headers[name] || null },
  async json() { return payload; },
});

test('monitor records the exact API result, request ID and safe request parameters without changing the response', async () => {
  const sink = capture();
  const payload = { code: 36009037, message: 'Too many requests', request_id: '20260908-request-id', data: null };
  const original = response(payload, 429, { 'retry-after': '120', 'set-cookie': 'private-cookie' });
  await withRunMonitor({ run_id: '91', writer: sink.writer }, () => withMonitorContext({ shop_id: 7, window_type: 'PAST_7_DAYS', attempt: 2 }, async () => {
    const result = await monitoredFetch('https://api.test/offline_task?app_key=private-app&sign=private-sign', {
      method: 'POST', headers: { 'x-tts-access-token': 'private-token' },
      body: JSON.stringify({ module_type: 'CREATOR', window_type: 'PAST_7_DAYS', end_day: 20260906 }),
    }, async () => original);
    assert.equal(result.status, 429);
    assert.equal(await result.json(), payload);
    return { pending: 1 };
  }));
  const event = [...sink.rows.values()].find((row) => row.event_type === 'API_REQUEST');
  assert.equal(event.status, 'FAILED');
  assert.equal(event.request_id, '20260908-request-id');
  assert.equal(event.http_status, 429);
  assert.equal(event.tiktok_code, '36009037');
  assert.equal(event.retry_after, '120');
  assert.equal(event.shop_id, 7);
  assert.equal(event.attempt, 2);
  assert.equal(event.window_type, 'PAST_7_DAYS');
  assert.equal(event.end_day, 20260906);
  assert.ok(event.duration_ms >= 0);
  assert.deepEqual(event.response_data, payload);
  const stored = JSON.stringify([...sink.rows.values()]);
  for (const secret of ['private-app', 'private-sign', 'private-token', 'private-cookie']) assert.equal(stored.includes(secret), false);
  assert.equal([...sink.rows.values()].at(-1).status, 'RETRY_PENDING');
});

test('a request is visible before it resolves and concurrent shops retain separate contexts', async () => {
  const sink = capture();
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  await withRunMonitor({ run_id: '92', writer: sink.writer }, async () => {
    const first = withMonitorContext({ shop_id: 1 }, async () => {
      const result = await monitoredFetch('https://api.test/slow', {}, async () => {
        entered(); await new Promise((resolve) => { release = resolve; });
        return response({ code: 0, request_id: 'shop-1' });
      });
      await result.json();
    });
    await started;
    assert.equal([...sink.rows.values()].find((row) => row.event_type === 'API_REQUEST').status, 'IN_FLIGHT');
    await withMonitorContext({ shop_id: 2 }, async () => {
      const result = await monitoredFetch('https://api.test/fast', {}, async () => response({ code: 0, request_id: 'shop-2' }));
      await result.json();
    });
    release(); await first;
  });
  const requests = [...sink.rows.values()].filter((row) => row.event_type === 'API_REQUEST');
  assert.deepEqual(requests.map((row) => [row.shop_id, row.request_id]), [[1, 'shop-1'], [2, 'shop-2']]);
});

test('network and invalid JSON errors keep their original exception and record completion', async () => {
  const sink = capture();
  await withMonitorContext({ run_id: '93', writer: sink.writer }, async () => {
    const error = new Error('connection reset');
    await assert.rejects(monitoredFetch('https://api.test/network', {}, async () => { throw error; }), (caught) => caught === error);
    const result = await monitoredFetch('https://api.test/invalid', {}, async () => ({
      ...response(null), async json() { throw new SyntaxError('invalid JSON'); },
    }));
    await assert.rejects(result.json(), /invalid JSON/);
  });
  const rows = [...sink.rows.values()];
  assert.deepEqual(rows.map((row) => row.status), ['NETWORK_ERROR', 'INVALID_RESPONSE']);
  assert.ok(rows.every((row) => row.completed_at));
});

test('capture excludes binary payloads and bounds large responses while leaving originals untouched', () => {
  const payload = { code: 0, data: { file: { base64: 'sensitive-binary'.repeat(100000) }, rows: Array.from({ length: 1000 }, () => ({ title: 'x'.repeat(9000) })) } };
  const result = sanitizePayload(payload);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 65536);
  assert.equal(JSON.stringify(result.data).includes('sensitive-binary'), false);
  assert.equal(payload.data.rows.length, 1000);
  assert.equal(result.data.data.file.base64.characters, payload.data.file.base64.length);
});

test('nested credentials and signed URLs are scrubbed, including echoed bearer values', async () => {
  const sink = capture();
  await withMonitorContext({ run_id: '94', writer: sink.writer }, async () => {
    const result = await monitoredFetch('https://api.test/profile', { headers: { Authorization: 'Bearer private-access' } }, async () => response({
      code: 0, message: 'Token private-access was used',
      data: { refresh_token: 'refresh-credential', url: 'https://cdn.test/file?signature=signed-credential&size=large' },
    }));
    await result.json();
  });
  const stored = JSON.stringify([...sink.rows.values()]);
  for (const value of ['private-access', 'refresh-credential', 'signed-credential']) assert.equal(stored.includes(value), false);
  assert.ok(stored.includes('size=large'));
});

test('telemetry persistence failures do not fail a successful API call', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const payload = { code: 0 };
  await withRunMonitor({ run_id: '95', writer: async () => { throw new Error('logging database offline'); } }, async () => {
    const result = await monitoredFetch('https://api.test/data', {}, async () => response(payload));
    assert.equal(await result.json(), payload);
  });
});

test('calls outside a scheduled run have no tracing side effects and preserve response identity', async () => {
  const original = response({ code: 0 });
  assert.equal(await monitoredFetch('https://api.test/data', {}, async () => original), original);
  assert.equal(await recordRunEvent('NO_RUN', { status: 'INFO' }), null);
});

test('worker and in-process wrappers do not double-count the same processing attempt', async () => {
  const sink = capture();
  await withRunMonitor({ run_id: '96', writer: sink.writer }, () => withRunMonitor({ run_id: 96 }, async () => ({ status: 'SUCCEEDED' })));
  assert.deepEqual([...sink.rows.values()].map((row) => row.event_type), ['RUN_STARTED', 'RUN_FINISHED']);
});
