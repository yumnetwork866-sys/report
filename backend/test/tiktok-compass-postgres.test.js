const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { sequelize } = require('../src/models');
const migration = require('../src/migrations/071_create_compass_request_state');
const monitorMigration = require('../src/migrations/072_create_scheduled_run_events');
const { ScheduledJobRunEvent } = require('../src/models');
const { withRunMonitor, monitoredFetch } = require('../src/services/scheduledRunMonitorService');
const { createCompassRequestGate, CREATE_ENDPOINT, LIST_ENDPOINT } = require('../src/services/tiktokCompassRequestService');
const { ensureCompassExport } = require('../src/services/tiktokCompassExportService');
const { withCompassLock, closeCompassLockPool } = require('../src/services/tiktokCompassLockService');

test('PostgreSQL migration, cross-connection locks, durable slots and nested export recovery', {
  skip: process.env.RUN_COMPASS_DB_TESTS !== '1',
}, async (t) => {
  const schema = `compass_test_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Client({ ...sequelize.config, user: sequelize.config.username });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const db = { config: { ...sequelize.config, options: `-c search_path=${schema}`, }, options: sequelize.options };
  t.after(async () => {
    await closeCompassLockPool(db);
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await sequelize.close();
  });
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query('CREATE TABLE scheduled_job_runs (id BIGINT PRIMARY KEY, status VARCHAR(32))');
  const migrationDb = { query: (sql) => admin.query(sql) };
  await migration.up({ sequelize: migrationDb });
  await migration.up({ sequelize: migrationDb });
  await monitorMigration.up({ sequelize: migrationDb });
  await admin.query("INSERT INTO scheduled_job_runs (id, status) VALUES (1, 'PROCESSING')");
  const EventModel = ScheduledJobRunEvent.schema(schema);
  await withRunMonitor({ run_id: '1', writer: async (fields, id) => {
    if (id) { await EventModel.update(fields, { where: { id } }); return id; }
    return (await EventModel.create(fields)).id;
  } }, async () => {
    const response = await monitoredFetch('https://api.test/offline_task?sign=secret-signature', {
      headers: { 'x-tts-access-token': 'secret-access-token' },
    }, async () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({ code: 36009037, request_id: 'monitor-request-1' }) }));
    await response.json();
    return { pending: 1 };
  });
  const monitorRows = await admin.query('SELECT status, request_id, request_data, response_data FROM scheduled_job_run_events WHERE event_type = $1', ['API_REQUEST']);
  assert.equal(monitorRows.rows[0].request_id, 'monitor-request-1');
  assert.equal(monitorRows.rows[0].status, 'FAILED');
  assert.equal(monitorRows.rows[0].response_data.code, 36009037);
  assert.equal(JSON.stringify(monitorRows.rows).includes('secret-access-token'), false);
  const columns = await admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'scheduled_job_runs'", [schema]);
  assert.ok(columns.rows.some((r) => r.column_name === 'next_retry_at'));

  let now = Date.now();
  const gate = createCompassRequestGate({ db, resolveShopId: async (cipher) => cipher, now: () => now, random: () => 0 });
  const independent = createCompassRequestGate({ db, resolveShopId: async (cipher) => cipher, now: () => now, random: () => 0 });
  const bucket = { shopCipher: 'integration-shop', endpoint: CREATE_ENDPOINT };
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const active = gate(bucket, async () => {
    entered();
    await new Promise((resolve) => { release = resolve; });
    return 'created';
  });
  await started;
  await assert.rejects(independent(bucket, () => assert.fail('simultaneous HTTP')), { code: 'TIKTOK_COMPASS_WAIT' });
  release();
  await active;
  await closeCompassLockPool(db);
  await assert.rejects(independent(bucket, () => assert.fail('slot survived restart')), { code: 'TIKTOK_COMPASS_WAIT' });
  now += 60000;
  const limited = Object.assign(new Error('rate limited'), { httpStatus: 429, tiktokCode: 36009037 });
  await assert.rejects(gate(bucket, async () => { throw limited; }));
  await gate({ ...bucket, endpoint: LIST_ENDPOINT }, async () => 'listed');
  const state = await admin.query('SELECT consecutive_rate_limits FROM tiktok_compass_request_gates WHERE cooldown_until IS NOT NULL');
  assert.equal(state.rows[0].consecutive_rate_limits, 1);

  // The export intent and API bucket locks nest on one session. Both writes
  // must autocommit and remain recoverable even if saving the local export fails.
  const spec = { shopId: 7, moduleType: 'CREATOR', windowType: 'PAST_7_DAYS', planType: 'ALL', endDay: 20260906 };
  let creates = 0;
  const deps = {
    db, findExisting: async () => null,
    createTask: () => gate({ shopCipher: 'another-shop', endpoint: CREATE_ENDPOINT }, async () => {
      creates += 1;
      return { data: { task_id: 'remote-id' } };
    }),
    saveExport: async () => { throw new Error('local write failed'); },
  };
  await assert.rejects(ensureCompassExport(spec, deps), /local write failed/);
  const intent = await admin.query('SELECT status, task_id FROM tiktok_compass_export_intents');
  assert.deepEqual(intent.rows, [{ status: 'CREATED', task_id: 'remote-id' }]);
  const recovered = await ensureCompassExport(spec, { ...deps, saveExport: async (taskId) => ({ taskId }) });
  assert.equal(recovered.taskId, 'remote-id');
  assert.equal(creates, 1);

  // A thrown operation releases its session lock for another caller.
  await assert.rejects(withCompassLock(db, 'release-on-error', 81429, async () => { throw new Error('broken'); }), /broken/);
  assert.equal(await withCompassLock(db, 'release-on-error', 81429, async () => 'available'), 'available');
  await monitorMigration.down({ sequelize: migrationDb });
  await migration.down({ sequelize: migrationDb });
});
