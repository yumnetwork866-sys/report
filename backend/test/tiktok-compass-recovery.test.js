const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CREATE_ENDPOINT, LIST_ENDPOINT, DOWNLOAD_ENDPOINT, createCompassRequestGate,
  configuredCompassRateLimitCooldownMs,
} = require('../src/services/tiktokCompassRequestService');
const { ensureCompassExport } = require('../src/services/tiktokCompassExportService');
const { runResumableCompassSync } = require('../src/services/tiktokCompassSyncService');
const { processCreatorPerformanceExport, processBasePerformanceExport } = require('../src/services/tiktokCreatorPerformanceService');

// Model separate committed writes and advisory locks shared by independent gates.
const memoryDb = () => {
  const locks = new Set();
  const gates = new Map();
  const intents = new Map();
  return {
    gates, intents,
    async withLock(db, key, namespace, operation) {
      const lock = `${namespace}:${key}`;
      if (locks.has(lock)) return { busy: true };
      locks.add(lock);
      try { return await operation(db); }
      finally { locks.delete(lock); }
    },
    async query(sql, { replacements: r } = {}) {
      if (sql.startsWith('SELECT * FROM tiktok_compass_request_gates')) return [[...(gates.has(r.key) ? [{ ...gates.get(r.key) }] : [])]];
      if (sql.includes('INSERT INTO tiktok_compass_request_gates')) {
        gates.set(r.key, { ...gates.get(r.key), next_request_at: r.next });
      } else if (sql.includes('UPDATE tiktok_compass_request_gates')) {
        Object.assign(gates.get(r.key), {
          consecutive_rate_limits: r.streak || 0, cooldown_until: r.until || null,
        });
      } else if (sql.startsWith('SELECT * FROM tiktok_compass_export_intents')) {
        return [[...(intents.has(r.key) ? [{ ...intents.get(r.key) }] : [])]];
      } else if (sql.includes('INSERT INTO tiktok_compass_export_intents')) {
        intents.set(r.key, { ...intents.get(r.key), status: 'CREATING' });
      } else if (sql.includes('UPDATE tiktok_compass_export_intents')) {
        Object.assign(intents.get(r.key), r.taskId
          ? { status: 'CREATED', task_id: r.taskId, request_id: r.requestId }
          : { status: r.status, error: r.error });
      } else throw new Error(`Unexpected SQL: ${sql}`);
      return [[], {}];
    },
  };
};
const limited = (until) => Object.assign(new Error('Too many requests'), {
  tiktokCode: 36009037, httpStatus: 429, cooldownUntil: until,
});

test('independent workers serialize creation, consume failed slots, and isolate shop/endpoint buckets', async () => {
  const db = memoryDb();
  let now = 1000000;
  const first = createCompassRequestGate({ db, resolveShopId: async (cipher) => cipher, withLock: db.withLock, now: () => now, random: () => 0 });
  const second = createCompassRequestGate({ db, resolveShopId: async (cipher) => cipher, withLock: db.withLock, now: () => now, random: () => 0 });
  const bucket = { shopCipher: 'shop-A', endpoint: CREATE_ENDPOINT };
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const running = first(bucket, async () => { entered(); return new Promise((resolve) => { release = resolve; }); });
  await started;
  await assert.rejects(second(bucket, () => assert.fail('concurrent create')), { code: 'TIKTOK_COMPASS_WAIT' });
  release('task-1');
  assert.equal(await running, 'task-1');
  await assert.rejects(second(bucket, () => assert.fail('unspaced create')), { code: 'TIKTOK_COMPASS_WAIT' });
  assert.equal(await second({ ...bucket, shopCipher: 'shop-B' }, async () => 'B'), 'B');
  now += 60000;
  const error = limited();
  await assert.rejects(first(bucket, async () => { throw error; }), (caught) => caught === error);
  assert.equal(error.cooldownUntil, now + 900000);
  assert.equal(await second({ ...bucket, endpoint: LIST_ENDPOINT }, async () => 'listed'), 'listed');
  assert.equal(await second({ ...bucket, endpoint: DOWNLOAD_ENDPOINT }, async () => 'downloaded'), 'downloaded');
  await assert.rejects(second(bucket, () => assert.fail('create during cooldown')), { code: 'TIKTOK_COMPASS_COOLDOWN' });
  now = error.cooldownUntil;
  const again = limited();
  await assert.rejects(second(bucket, async () => { throw again; }));
  assert.equal(again.cooldownUntil, now + 1800000, 'list/download success must not reset create streak');
});

test('backoff applies positive jitter and never retries before Retry-After', () => {
  assert.equal(configuredCompassRateLimitCooldownMs(1, 0, () => 0), 900000);
  assert.equal(configuredCompassRateLimitCooldownMs(2, 0, () => 0.5), 1980000);
  assert.equal(configuredCompassRateLimitCooldownMs(10, 0, () => 0), 3600000);
  assert.equal(configuredCompassRateLimitCooldownMs(1, 7200000, () => 1), 7200000);
});

test('changing the shop cipher does not bypass the platform shop request bucket', async () => {
  const db = memoryDb();
  const gate = createCompassRequestGate({
    db, withLock: db.withLock, resolveShopId: async () => 'stable-platform-shop-id',
  });
  await gate({ shopCipher: 'old-cipher', endpoint: CREATE_ENDPOINT }, async () => 'created');
  await assert.rejects(gate({ shopCipher: 'new-cipher', endpoint: CREATE_ENDPOINT }, () => assert.fail('same shop')),
    { code: 'TIKTOK_COMPASS_WAIT' });
});

test('a gate persistence failure after successful HTTP is an unknown outcome, not permission to recreate', async () => {
  const db = memoryDb();
  const query = db.query.bind(db);
  db.query = async (sql, options) => {
    if (sql.includes('SET consecutive_rate_limits = 0')) throw new Error('lost DB connection');
    return query(sql, options);
  };
  const gate = createCompassRequestGate({ db, resolveShopId: async (cipher) => cipher, withLock: db.withLock });
  await assert.rejects(gate({ shopCipher: 'A', endpoint: CREATE_ENDPOINT }, async () => ({ data: { task_id: 'remote' } })),
    (error) => error.requestOutcomeUnknown && error.compassRetryable);
});

const spec = { shopId: 7, moduleType: 'CREATOR', windowType: 'PAST_7_DAYS', planType: 'ALL', endDay: 20260906 };
test('two export callers create once and reuse the saved task', async () => {
  const db = memoryDb();
  let existing;
  let calls = 0;
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const dependencies = {
    db, withLock: db.withLock, findExisting: async () => existing,
    createTask: async () => {
      calls += 1;
      entered();
      await new Promise((resolve) => { release = resolve; });
      return { data: { task: { id: 'remote-1' } } };
    },
    saveExport: async (taskId) => { existing = { task_id: taskId, status: 'PROCESSING' }; return existing; },
  };
  const running = ensureCompassExport(spec, dependencies);
  await started;
  await assert.rejects(ensureCompassExport(spec, dependencies), { code: 'TIKTOK_COMPASS_WAIT' });
  release();
  await running;
  assert.equal((await ensureCompassExport(spec, dependencies)).task_id, 'remote-1');
  assert.equal(calls, 1);
});

test('a lost create response is reconciled with exact parameters, never blindly recreated', async () => {
  const db = memoryDb();
  let creates = 0;
  let rows = [];
  const dependencies = {
    db, withLock: db.withLock, findExisting: async () => null,
    createTask: async () => { creates += 1; throw Object.assign(new Error('fetch failed'), { compassRetryable: true }); },
    listTasks: async () => ({ data: { tasks: rows } }),
    saveExport: async (taskId) => ({ task_id: taskId }),
  };
  await assert.rejects(ensureCompassExport(spec, dependencies), /fetch failed/);
  rows = [{ id: 'wrong-day', module_type: 'CREATOR', window_type: 'PAST_7_DAYS', plan_type: 'ALL', end_day: 20260905 }];
  await assert.rejects(ensureCompassExport(spec, dependencies), { code: 'TIKTOK_COMPASS_UNCERTAIN' });
  rows.push({ ...rows[0], id: 'recovered', end_day: 20260906 });
  assert.equal((await ensureCompassExport(spec, dependencies)).task_id, 'recovered');
  assert.equal(creates, 1);
});

test('a database save failure after create keeps the remote task ID for the next attempt', async () => {
  const db = memoryDb();
  let creates = 0;
  const dependencies = {
    db, withLock: db.withLock, findExisting: async () => null,
    createTask: async () => { creates += 1; return { data: { task_id: 'persisted' } }; },
    saveExport: async () => { throw new Error('database unavailable'); },
  };
  await assert.rejects(ensureCompassExport(spec, dependencies), /database unavailable/);
  dependencies.saveExport = async (taskId) => ({ task_id: taskId });
  assert.equal((await ensureCompassExport(spec, dependencies)).task_id, 'persisted');
  assert.equal(creates, 1);
});

test('list/download rate limits preserve local task IDs for creator and base exports', async () => {
  for (const processExport of [processCreatorPerformanceExport, processBasePerformanceExport]) {
    for (const phase of ['list', 'download']) {
      const record = { task_id: 'existing', status: 'PROCESSING', async update(fields) { Object.assign(this, fields); } };
      await assert.rejects(processExport({ id: 7 }, record, {
        listTasks: async () => {
          if (phase === 'list') throw limited();
          return { data: { tasks: [{ id: 'existing', status: 'SUCCEEDED' }] } };
        },
        downloadFile: async () => { throw limited(); },
      }));
      assert.equal(record.status, 'PROCESSING');
      assert.equal(record.task_id, 'existing');
      assert.equal(record.completed_at, null);
    }
  }
});

test('only a confirmed remote terminal task failure marks the local export FAILED', async () => {
  const record = { task_id: 'failed-task', async update(fields) { Object.assign(this, fields); } };
  await assert.rejects(processCreatorPerformanceExport({ id: 7 }, record, {
    listTasks: async () => ({ data: { tasks: [{ id: 'failed-task', status: 'FAILED' }] } }),
  }), (error) => error.compassTaskTerminal);
  assert.equal(record.status, 'FAILED');
});

test('a resumed job preserves reporting day and skips completed windows and shops', async () => {
  const shops = [{ id: 1, name: 'A', region: 'MY' }, { id: 2, name: 'B', region: 'MY' }];
  let now = Date.parse('2026-09-08T23:55:00Z');
  let checkpoint;
  const calls = [];
  let fail = true;
  const dependencies = {
    now: () => now, endDayForShop: () => 20260906,
    performWindow: async (shop, window, endDay) => {
      calls.push([shop.id, window.module_type, window.window_type, endDay]);
      if (fail && shop.id === 1 && window.window_type === 'PAST_7_DAYS') throw limited(now + 900000);
      return { window_type: window.window_type, export_id: calls.length };
    },
  };
  await assert.rejects(runResumableCompassSync({
    shops, checkpoint: async (summary) => { checkpoint = JSON.parse(JSON.stringify(summary)); },
  }, dependencies), { code: 'TIKTOK_COMPASS_RETRY_PENDING' });
  assert.equal(checkpoint.results[0].windows[0].status, 'SUCCEEDED');
  assert.equal(checkpoint.results[0].windows[1].status, 'RETRY_PENDING');
  assert.equal(checkpoint.results[0].windows[2].status, 'PENDING');
  assert.equal(checkpoint.results[1].status, 'SUCCEEDED');
  const before = calls.length;
  fail = false;
  now += 86400000;
  const result = await runResumableCompassSync({ shops, resumeState: checkpoint.compass_state }, {
    ...dependencies, endDayForShop: () => assert.fail('must use persisted day'),
  });
  assert.equal(result.succeeded, 2);
  assert.equal(calls.length - before, 5);
  assert.ok(calls.slice(before).every(([shopId, , , day]) => shopId === 1 && day === 20260906));
});

test('retry exhaustion becomes terminal while local limiter deferrals do not consume attempts', async () => {
  let now = 1000000;
  let resumeState;
  let mode = 'wait';
  let calls = 0;
  const shops = [{ id: 1, region: 'MY' }];
  const run = () => runResumableCompassSync({ shops, resumeState, checkpoint: async (s) => { resumeState = s.compass_state; } }, {
    now: () => now, retryCap: 2,
    performWindow: async () => {
      calls += 1;
      throw mode === 'wait' ? Object.assign(new Error('slot occupied'), { code: 'TIKTOK_COMPASS_WAIT', cooldownUntil: now + 60000 }) : limited(now + 60000);
    },
  });
  await assert.rejects(run(), { code: 'TIKTOK_COMPASS_RETRY_PENDING' });
  assert.equal(resumeState.shops[0].windows[0].retry_count, 0);
  const previousCalls = calls;
  await assert.rejects(run(), { code: 'TIKTOK_COMPASS_RETRY_PENDING' });
  assert.equal(calls, previousCalls, 'an early resume must not call TikTok');
  mode = 'rate';
  for (let i = 0; i < 2; i += 1) {
    now += 60000;
    await assert.rejects(run(), { code: 'TIKTOK_COMPASS_RETRY_PENDING' });
  }
  now += 60000;
  await assert.rejects(run(), (error) => error.summary.failed === 1 && error.summary.pending === 0);
  assert.match(resumeState.shops[0].error, /retry limit 2 reached/);
});

test('cancellation prevents another reporting window from starting', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(runResumableCompassSync({ shops: [{ id: 1 }], signal: controller.signal }, {
    performWindow: async () => { calls += 1; controller.abort(); return {}; },
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
