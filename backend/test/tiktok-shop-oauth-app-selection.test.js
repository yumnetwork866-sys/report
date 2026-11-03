const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');

test('OAuth shop lookup uses the same selected app as token exchange, including AUTO region', async (t) => {
  const credentialsPath = require.resolve('../src/services/tiktokAppService');
  const servicePath = require.resolve('../src/services/tiktokShopService');
  const selected = { id: 5, appKey: 'vn-app-key', appSecret: 'vn-app-secret' };
  const fallback = { id: 1, appKey: 'my-app-key', appSecret: 'my-app-secret' };
  t.after(mockModule(credentialsPath, {
    getAppCredentials: (_type, _region, options) => options?.appId === 5 ? selected : fallback,
    getCandidateSecrets: () => [],
  }));
  t.after(() => { delete require.cache[servicePath]; });
  const { exchangeShopAuthorizationCode, getAuthorizedShops, signature } = require(servicePath);
  const selectedApp = { appType: 'partner', appId: 5, region: 'AUTO' };
  const token = await exchangeShopAuthorizationCode('test-code', async (url) => {
    assert.equal(url.searchParams.get('app_key'), selected.appKey);
    assert.equal(url.searchParams.get('app_secret'), selected.appSecret);
    return { ok: true, json: async () => ({ code: 0, data: { access_token: 'vn-token' } }) };
  }, selectedApp);
  const shops = await getAuthorizedShops(token.access_token, async (url, options) => {
    assert.equal(url.searchParams.get('app_key'), selected.appKey);
    assert.equal(options.headers['x-tts-access-token'], 'vn-token');
    assert.equal(url.searchParams.get('sign'), signature({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      appSecret: selected.appSecret,
    }));
    return { ok: true, json: async () => ({ code: 0, data: { shops: [{ id: 'vn-shop' }] } }) };
  }, selectedApp);
  assert.equal(shops[0].id, 'vn-shop');
});
