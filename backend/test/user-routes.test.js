const test = require('node:test');
const assert = require('node:assert/strict');

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

test('user routes enforce requirePermission("users") on GET /:id and PUT /:id', () => {
  const userRoutes = require('../src/routes/userRoutes');

  const getByIdLayer = userRoutes.stack.find(
    (layer) => layer.route?.path === '/:id' && layer.route?.methods?.get,
  );
  assert.ok(getByIdLayer, 'GET /:id route exists');
  assert.equal(getByIdLayer.route.stack.length, 2, 'GET /:id has 2 handlers (middleware + controller)');

  const putByIdLayer = userRoutes.stack.find(
    (layer) => layer.route?.path === '/:id' && layer.route?.methods?.put,
  );
  assert.ok(putByIdLayer, 'PUT /:id route exists');
  assert.equal(putByIdLayer.route.stack.length, 2, 'PUT /:id has 2 handlers (middleware + controller)');

  // Test middleware on GET /:id
  const getPermissionMiddleware = getByIdLayer.route.stack[0].handle;
  let nextCalled = false;
  const resForbidden = makeResponse();
  getPermissionMiddleware(
    { session: { sub: 2, role: 'member', permissions: ['tiktok'] } },
    resForbidden,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(resForbidden.statusCode, 403);

  nextCalled = false;
  getPermissionMiddleware(
    { session: { sub: 2, role: 'member', permissions: ['users'] } },
    resForbidden,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);

  // Test middleware on PUT /:id
  const putPermissionMiddleware = putByIdLayer.route.stack[0].handle;
  nextCalled = false;
  const resForbiddenPut = makeResponse();
  putPermissionMiddleware(
    { session: { sub: 2, role: 'member', permissions: ['tiktok'] } },
    resForbiddenPut,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(resForbiddenPut.statusCode, 403);

  nextCalled = false;
  putPermissionMiddleware(
    { session: { sub: 2, role: 'member', permissions: ['users'] } },
    resForbiddenPut,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});
