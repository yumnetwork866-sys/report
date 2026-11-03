const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');

test('app secrets and mutations require app.manage independently from shop management', (t) => {
  const controllerPath = require.resolve('../src/controllers/tiktokAppController');
  const routePath = require.resolve('../src/routes/tiktokAppRoutes');
  t.after(mockModule(controllerPath, Object.fromEntries([
    'listApps', 'listActiveApps', 'getAppSecret', 'createApp', 'updateApp', 'deleteApp', 'toggleAppStatus',
  ].map((name) => [name, () => {}]))));
  t.after(() => { delete require.cache[routePath]; });
  const router = require(routePath);
  const protectedRoutes = router.stack.filter((layer) => layer.route?.stack.length > 1);
  assert.equal(protectedRoutes.length, 5);
  for (const layer of protectedRoutes) {
    for (const [permissions, allowed] of [
      [['admin.shops.manage'], false],
      [['app.manage'], true],
      [[], false],
    ]) {
      let passed = false;
      const res = { status(code) { this.code = code; return this; }, json() {} };
      layer.route.stack[0].handle({ session: { role: 'member', permissions } }, res, () => { passed = true; });
      assert.equal(passed, allowed, `${layer.route.path}: ${permissions}`);
      if (!allowed) assert.equal(res.code, 403);
    }
  }
});
