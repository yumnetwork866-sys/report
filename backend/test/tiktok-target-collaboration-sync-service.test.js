const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TARGET_PAGE_SIZE,
  createTargetRequestRunner,
  createTargetCollaborationSyncService,
} = require('../src/services/tiktokTargetCollaborationSyncService');

test('Target Collaboration requests are not delayed by the Creator one-request-per-minute gate', async () => {
  const waits = [];
  const writes = [];
  const runner = createTargetRequestRunner({
    CooldownModel: {
      findOne: async () => ({
        cooldown_until: new Date('2026-07-22T01:01:00.000Z'),
        reason: 'Target Collaboration full-sync request interval.',
      }),
      upsert: async (value) => writes.push(value),
    },
    now: () => new Date('2026-07-22T01:00:00.000Z'),
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(await runner(9, async () => 'ok'), 'ok');
  assert.deepEqual(waits, []);
  assert.deepEqual(writes, []);
});

test('full Target Collaboration sync walks statuses, details, profiles, and invitations', async () => {
  const calls = [];
  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING', 'COMPLETED'],
    runRequest: async (_shopId, operation) => operation(),
    search: async ({ status, pageSize }) => {
      calls.push(['search', status, pageSize]);
      return ({
      data: { target_collaborations: status === 'ONGOING' ? [{ id: 'collab-1' }] : [] },
      });
    },
    getDetail: async ({ collaborationId }) => ({
      data: { target_collaboration: { id: collaborationId, creators: [{ creator_open_id: 'creator-1', username: 'creator.one' }] } },
    }),
    hydrate: async (shopId, rows) => {
      calls.push(['hydrate', shopId, rows[0].id]);
      return rows;
    },
    saveSnapshots: async (shopId, rows) => calls.push(['snapshots', shopId, rows[0].id]),
    recordInvites: async (shopId, rows) => calls.push(['invites', shopId, rows[0].creators.length]),
    logger: { info() {}, error() {} },
  });
  const result = await service.syncShop({
    id: 9,
    cipher: 'cipher',
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  });

  assert.equal(result.collaborations, 1);
  assert.equal(result.creators, 1);
  assert.deepEqual(calls, [
    ['search', 'ONGOING', TARGET_PAGE_SIZE],
    ['hydrate', 9, 'collab-1'],
    ['snapshots', 9, 'collab-1'],
    ['invites', 9, 1],
    ['search', 'COMPLETED', TARGET_PAGE_SIZE],
  ]);
});

test('full Target Collaboration sync is skipped without affiliate scope', async () => {
  const service = createTargetCollaborationSyncService({ logger: { info() {}, error() {} } });
  const result = await service.syncShop({ id: 2, authorization: { granted_scopes: [] } });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'missing_scope');
});

test('Target Collaboration applies pacing delay between detail requests', async () => {
  const sleeps = [];
  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING'],
    runRequest: async (_shopId, operation) => operation(),
    search: async () => ({
      data: { target_collaborations: [{ id: 'collab-1' }, { id: 'collab-2' }, { id: 'collab-3' }] },
    }),
    getDetail: async ({ collaborationId }) => ({
      data: { target_collaboration: { id: collaborationId, creators: [] } },
    }),
    hydrate: async (_shopId, rows) => rows,
    saveSnapshots: async () => {},
    recordInvites: async () => {},
    sleep: async (ms) => { sleeps.push(ms); },
    detailPacingMs: 400,
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await service.syncShop({
    id: 1,
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  });

  assert.equal(result.collaborations, 3);
  // Pacing delay should be called before the 2nd and 3rd detail requests
  assert.deepEqual(sleeps, [400, 400]);
});

test('Target Collaboration retries detail request on timeout and succeeds', async () => {
  const sleeps = [];
  let attempts = 0;
  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING'],
    runRequest: async (_shopId, operation) => operation(),
    search: async () => ({
      data: { target_collaborations: [{ id: 'collab-timeout-1' }] },
    }),
    getDetail: async ({ collaborationId }) => {
      attempts += 1;
      if (attempts === 1) {
        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      return {
        data: { target_collaboration: { id: collaborationId, creators: [] } },
      };
    },
    hydrate: async (_shopId, rows) => rows,
    saveSnapshots: async () => {},
    recordInvites: async () => {},
    sleep: async (ms) => { sleeps.push(ms); },
    detailPacingMs: 400,
    maxTimeoutRetries: 2,
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await service.syncShop({
    id: 1,
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  });

  assert.equal(result.collaborations, 1);
  assert.equal(attempts, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 1000);
});

test('Target Collaboration exhausts retries on persistent timeout and throws', async () => {
  let attempts = 0;
  const sleeps = [];
  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING'],
    runRequest: async (_shopId, operation) => operation(),
    search: async () => ({
      data: { target_collaborations: [{ id: 'collab-timeout-fail' }] },
    }),
    getDetail: async () => {
      attempts += 1;
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    },
    hydrate: async (_shopId, rows) => rows,
    saveSnapshots: async () => {},
    recordInvites: async () => {},
    sleep: async (ms) => { sleeps.push(ms); },
    detailPacingMs: 400,
    maxTimeoutRetries: 2,
    logger: { info() {}, warn() {}, error() {} },
  });

  await assert.rejects(
    () => service.syncShop({
      id: 1,
      authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
    }),
    (err) => {
      assert.equal(err.name, 'TimeoutError');
      assert.equal(err.message, 'The operation was aborted due to timeout');
      return true;
    },
  );

  // 1 initial attempt + 2 retries = 3 attempts total
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('Target Collaboration does not retry if signal was aborted', async () => {
  let attempts = 0;
  const controller = new AbortController();
  controller.abort();

  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING'],
    runRequest: async (_shopId, operation) => operation(),
    search: async () => ({
      data: { target_collaborations: [{ id: 'collab-abort' }] },
    }),
    getDetail: async () => {
      attempts += 1;
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    },
    hydrate: async (_shopId, rows) => rows,
    saveSnapshots: async () => {},
    recordInvites: async () => {},
    sleep: async () => {},
    logger: { info() {}, warn() {}, error() {} },
  });

  await assert.rejects(
    () => service.syncShop(
      { id: 1, authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] } },
      { signal: controller.signal },
    ),
    (err) => {
      assert.equal(err.name, 'AbortError');
      return true;
    },
  );

  assert.equal(attempts, 0);
});
