const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionToken, requireAdmin, requireAnyPermission, requirePermission } = require('../src/lib/session');

const makeResponse = () => ({
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

test('requireAdmin accepts a valid session token', (t) => {
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

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.session.sub, 7);
  assert.equal(req.session.role, 'member');
});

test('requireAdmin rejects malformed sessions', (t) => {
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

  requireAdmin(req, res, () => {
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
