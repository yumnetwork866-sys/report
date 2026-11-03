const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const { createSessionToken, requireAdmin, requireAnyPermission, requirePermission } = require('../src/lib/session');

const makeResponse = () => ({
  headers: {},
  set(name, value) { this.headers[name] = value; return this; },
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test('requireAdmin accepts a valid session token', async (t) => {
  t.after(mockModule(require.resolve('../src/models'), {
    User: { findByPk: async () => ({ id: 7, role: 'member', is_active: true }) },
    Role: { findByPk: async () => ({ permissions: [] }) },
  }));
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalExitCode = process.exitCode;
  process.env.SESSION_SECRET = 'session-secret';

  t.after(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    process.exitCode = originalExitCode;
  });

  const token = createSessionToken({ id: 7, role: 'member' });
  const req = {
    get(name) {
      return name === 'authorization' ? `Bearer ${token}` : undefined;
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.session.sub, 7);
  assert.equal(req.session.role, 'member');
});

test('requireAdmin rejects malformed sessions', async (t) => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalExitCode = process.exitCode;
  process.env.SESSION_SECRET = 'session-secret';

  t.after(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    process.exitCode = originalExitCode;
  });

  const token = createSessionToken({ id: 8, role: 123 });
  const req = {
    get(name) {
      return name === 'authorization' ? `Bearer ${token}` : undefined;
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Session is invalid or expired');
});

test('permission middleware accepts granular, any-of, and legacy permissions', () => {
  const nextCalls = [];
  const next = () => nextCalls.push(true);

  requirePermission('shop.orders.view')(
    { session: { role: 'member', permissions: ['shop.orders.view'] } },
    makeResponse(),
    next,
  );
  requireAnyPermission(['shop.orders.view', 'shop.bookings.video.view'])(
    { session: { role: 'member', permissions: ['shop.bookings.video.view'] } },
    makeResponse(),
    next,
  );
  requirePermission('shop.analytics.view')(
    { session: { role: 'member', permissions: ['tiktok'] } },
    makeResponse(),
    next,
  );

  assert.equal(nextCalls.length, 3);
});

test('existing tokens use current role permissions and account status on every request', async (t) => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'live-permissions-test';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });
  let user = { id: 7, role: 'admin', is_active: true };
  let permissions = ['shop.orders.view'];
  t.after(mockModule(require.resolve('../src/models'), {
    User: { findByPk: async () => user },
    Role: { findByPk: async () => ({ permissions }) },
  }));
  const token = createSessionToken(user, ['shop.orders.view']);
  const request = async () => {
    const req = { get: () => `Bearer ${token}` };
    const res = makeResponse();
    let passed = false;
    await requireAdmin(req, res, (error) => { assert.ifError(error); passed = true; });
    return { req, res, passed };
  };
  // Demotion and revocation must override an admin token that is still unexpired.
  user = { ...user, role: 'member' };
  permissions = [];
  let result = await request();
  assert.equal(result.passed, true);
  assert.equal(result.req.session.role, 'member');
  assert.deepEqual(result.req.session.permissions, []);
  const denied = makeResponse();
  requirePermission('shop.orders.view')(result.req, denied, () => assert.fail('revoked permission accepted'));
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(JSON.parse(result.res.headers['X-Session-Access']), { role: 'member', permissions: [] });
  // Grants also apply without issuing another token.
  permissions = ['shop.orders.view'];
  result = await request();
  let allowed = false;
  requirePermission('shop.orders.view')(result.req, result.res, () => { allowed = true; });
  assert.equal(allowed, true);
  user.is_active = false;
  result = await request();
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.passed, false);
  user = null;
  result = await request();
  assert.equal(result.res.statusCode, 401);
});

test('session verification fails closed when the database is unavailable', async (t) => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'database-error-test';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });
  const databaseError = new Error('database unavailable');
  t.after(mockModule(require.resolve('../src/models'), {
    User: { findByPk: async () => { throw databaseError; } },
  }));
  const token = createSessionToken({ id: 7, role: 'admin' });
  await requireAdmin({ get: () => `Bearer ${token}` }, makeResponse(), (error) => {
    assert.equal(error, databaseError);
  });
});
