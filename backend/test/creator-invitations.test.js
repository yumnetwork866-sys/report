const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');

test('invite picker loads one active invitation page without full campaign synchronization', async (t) => {
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const calls = [];
  const shop = { id: 7, cipher: 'cipher', authorization: { id: 3 } };
  const invitations = [{ id: 'invitation-1', name: 'Campaign', status: 'ONGOING' }];
  const restores = [
    mockModule(require.resolve('../src/services/tiktokShopService'), {
      searchTargetCollaborations: async (options) => {
        calls.push(options);
        return { request_id: 'request-1', data: { target_collaborations: invitations } };
      },
      getTargetCollaboration: () => assert.fail('picker must not load campaign details'),
    }),
    mockModule(require.resolve('../src/repositories/tiktokShopRepository'), {
      findShopWithAuthorization: async () => shop,
    }),
    mockModule(require.resolve('../src/lib/tiktokDemoFixtures'), { isDemoAuthorization: () => false }),
  ];
  t.after(() => {
    delete require.cache[servicePath];
    restores.reverse().forEach((restore) => restore());
  });
  const service = require(servicePath);
  const res = {
    set() {},
    status(code) { assert.fail(`Unexpected response ${code}`); },
    json(value) { this.body = value; },
  };
  await service.listCreatorInvitations({ params: { shopId: '7' }, query: {} }, res);
  assert.deepEqual(res.body, { invitations, request_id: 'request-1' });
  assert.deepEqual(calls, [{ authorization: shop.authorization, shopCipher: 'cipher', pageSize: 20, status: 'ONGOING' }]);
  assert.equal(service.listTargetCollaborations, undefined);
});

test('retired campaign route is removed while invitations require the invite permission', () => {
  const router = require('../src/routes/tiktokShopRoutes').adminRouter;
  assert.equal(router.stack.some((layer) => layer.route?.path === '/shops/:shopId/affiliate/target-collaborations'), false);
  const route = router.stack.find((layer) => layer.route?.path === '/shops/:shopId/affiliate/creator-invitations').route;
  for (const [permissions, allowed] of [
    [['shop.affiliate.invite'], true],
    [['shop.affiliate.discovery.view'], false],
    [['shop.affiliate.target.view'], false],
  ]) {
    let passed = false;
    const res = { status(code) { this.code = code; return this; }, json() {} };
    route.stack[0].handle({ session: { role: 'member', permissions } }, res, () => { passed = true; });
    assert.equal(passed, allowed);
    if (!allowed) assert.equal(res.code, 403);
  }
});

test('retired permission is absent from both catalogs and normalized roles', async () => {
  const backend = require('../src/lib/permissions');
  const frontend = await import('../../frontend/src/lib/permissions.js');
  assert.deepEqual([...frontend.ALL_PERMISSIONS].sort(), [...backend.ALL_PERMISSIONS].sort());
  assert.equal(backend.ALL_PERMISSIONS.includes('shop.affiliate.target.view'), false);
  assert.deepEqual(backend.normalizePermissions(['shop.affiliate.target.view', 'shop.affiliate.invite']), ['shop.affiliate.invite']);
});
