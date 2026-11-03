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

test('shop analytics, videos, affiliate, Compass and refresh use the authorization app', async (t) => {
  const credentialsPath = require.resolve('../src/services/tiktokAppService');
  const servicePath = require.resolve('../src/services/tiktokShopService');
  const apps = {
    1: { id: 1, appKey: 'my-app-key', appSecret: 'my-app-secret' },
    5: { id: 5, appKey: 'vn-app-key', appSecret: 'vn-app-secret' },
  };
  t.after(mockModule(credentialsPath, {
    getAppCredentials: (_type, _region, options) => apps[options?.appId] || apps[1],
    getCandidateSecrets: () => [],
  }));
  t.after(() => { delete require.cache[servicePath]; });
  const service = require(servicePath);
  const { encryptPartnerToken } = require('../src/lib/tiktokPartnerTokenEncryption');
  for (const appId of [5, 1]) {
    const app = apps[appId];
    const authorization = {
      app_id: appId,
      app_type: 'partner',
      access_token_encrypted: encryptPartnerToken(`token-${appId}`),
      access_token_expires_at: new Date(Date.now() + 3600000),
      refresh_token_encrypted: encryptPartnerToken(`refresh-${appId}`),
      granted_scopes: ['data.shop_analytics.public.read', 'seller.affiliate_collaboration.read'],
      async update(values) { Object.assign(this, values); },
    };
    const fetchImpl = async (url, options) => {
      assert.equal(url.searchParams.get('app_key'), app.appKey, url.pathname);
      assert.equal(options.headers['x-tts-access-token'], `token-${appId}`);
      assert.equal(url.searchParams.get('sign'), service.signature({
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: options.body || '',
        appSecret: app.appSecret,
      }));
      return { ok: true, json: async () => ({ code: 0, data: {} }) };
    };
    const params = { authorization, shopCipher: 'cipher', startDate: '2026-11-01', endDate: '2026-11-03' };
    await service.getShopPerformance(params, fetchImpl);
    await service.getShopVideoPerformance(params, fetchImpl);
    await service.getShopVideoPerformanceDetails({ ...params, videoId: '1234567890123456789' }, fetchImpl);
    await service.searchOpenCollaborations(params, fetchImpl);
    await service.downloadCompassExportFile({
      ...params, taskId: 'task', requestGate: (_options, operation) => operation(),
    }, fetchImpl);
    authorization.access_token_expires_at = new Date(0);
    let refreshes = 0;
    await service.getShopPerformance(params, async (url, options) => {
      if (url.searchParams.has('refresh_token')) {
        refreshes++;
        assert.equal(url.searchParams.get('app_key'), app.appKey);
        assert.equal(url.searchParams.get('app_secret'), app.appSecret);
        assert.equal(url.searchParams.get('refresh_token'), `refresh-${appId}`);
        return { ok: true, json: async () => ({ code: 0, data: {
          access_token: `token-${appId}`, user_type: 0, access_token_expire_in: 3600,
        } }) };
      }
      return fetchImpl(url, options);
    });
    assert.equal(refreshes, 1);
  }
});
