const assert = require('node:assert/strict');
const test = require('node:test');
const { createLiveHostService } = require('../src/services/liveHostService');

test('host assignment persists a validated app user for the exact shop and session', async () => {
  const calls = [];
  const host = { id: 7, name: 'Host', email: 'host@example.com', avatar_url: null };
  const service = createLiveHostService({ query: async (sql, options) => {
    calls.push({ sql, ...options });
    if (sql.includes('FROM tiktok_shops')) return [{ id: 2 }];
    if (sql.includes('FROM users')) return [host];
    return [];
  } });
  assert.deepEqual(await service.execute('save', {
    params: { shopId: 2, sessionId: '1234567890123456789' }, body: { user_id: 7 },
  }), { body: { host } });
  assert.match(calls[1].sql, /is_active = TRUE/);
  assert.match(calls[2].sql, /ON CONFLICT \(shop_id, session_id\)/);
  assert.deepEqual(calls[2].replacements, { shopId: 2, sessionId: '1234567890123456789', userId: 7 });
});

test('removing a host only deletes the selected shop/session assignment', async () => {
  const calls = [];
  const service = createLiveHostService({ query: async (sql, options) => {
    calls.push({ sql, ...options });
    return sql.includes('FROM tiktok_shops') ? [{ id: 2 }] : [];
  } });
  assert.deepEqual(await service.execute('save', {
    params: { shopId: 2, sessionId: 'room1' }, body: { user_id: null },
  }), { body: { host: null } });
  assert.match(calls[1].sql, /DELETE.*shop_id = :shopId AND session_id = :sessionId/);
  assert.deepEqual(calls[1].replacements, { shopId: 2, sessionId: 'room1' });
});

test('missing shop or inactive user cannot create an assignment', async () => {
  for (const shopExists of [false, true]) {
    let writes = 0;
    const service = createLiveHostService({ query: async (sql) => {
      if (sql.startsWith('SELECT id FROM tiktok_shops')) return shopExists ? [{ id: 2 }] : [];
      if (sql.includes('FROM users')) return [];
      writes += 1;
      return [];
    } });
    const result = await service.execute('save', { params: { shopId: 2, sessionId: 'room1' }, body: { user_id: 7 } });
    assert.equal(result.status, shopExists ? 400 : 404);
    assert.equal(writes, 0);
  }
});

test('host directory exposes only active users and assignments support shop filtering', async () => {
  const calls = [];
  const service = createLiveHostService({ query: async (sql, options) => { calls.push({ sql, ...options }); return []; } });
  await service.execute('users', {});
  await service.execute('list', { query: { shop_id: 2 } });
  await service.execute('list', {});
  assert.match(calls[0].sql, /SELECT id, name, email, avatar_url FROM users\s+WHERE is_active = TRUE/);
  assert.deepEqual(calls[1].replacements, { shopId: 2 });
  assert.deepEqual(calls[2].replacements, { shopId: null });
});

test('session notes and comments can be persisted and listed', async () => {
  const calls = [];
  const service = createLiveHostService({ query: async (sql, options) => {
    calls.push({ sql, ...options });
    if (sql.includes('FROM tiktok_shops')) return [{ id: 2 }];
    return [];
  } });
  const result = await service.execute('save', {
    params: { shopId: 2, sessionId: 'room-123' },
    body: { comment: 'KOC live nhiệt tình, chốt 50 đơn' },
  });
  assert.deepEqual(result, { body: { host: null, comment: 'KOC live nhiệt tình, chốt 50 đơn' } });
  assert.match(calls[1].sql, /INSERT INTO live_session_hosts.*comment/);
  assert.equal(calls[1].replacements.comment, 'KOC live nhiệt tình, chốt 50 đơn');
});
