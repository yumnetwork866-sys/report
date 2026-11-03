const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');

test('failed Shop OAuth records the selected app and actual token scopes without storing the token', async (t) => {
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const { TikTokApp } = require('../src/models');
  const app = { id: 6, name: 'TikTok OMS Viet Nam', app_type: 'partner', region: 'AUTO' };
  t.mock.method(TikTokApp, 'findByPk', async (id) => { assert.equal(id, 6); return app; });
  t.mock.method(console, 'error', () => {});
  let recorded;
  const error = Object.assign(new Error('Access denied'), { tiktokCode: 105005, httpStatus: 401, endpoint: '/authorization/202309/shops', requestId: 'request-1' });
  const restores = [
    mockModule(require.resolve('../src/services/tiktokShopService'), {
      parseShopAuthorizationState: () => ({ appId: 6, appType: 'partner', oauthType: 'shop', returnPath: '/manage/connections' }),
      exchangeShopAuthorizationCode: async () => ({ access_token: 'private-test-token', user_type: 0, granted_scopes: ['seller.order.info'] }),
      shopTokenFields: () => ({}),
      getAuthorizedShops: async (_token, _fetch, options) => { assert.equal(options.appId, 6); throw error; },
    }),
    mockModule(require.resolve('../src/services/authLogService'), { recordAuthLog: async (value) => { recorded = value; } }),
  ];
  t.after(() => { delete require.cache[servicePath]; restores.reverse().forEach((restore) => restore()); });
  const { handleShopOauthCallback } = require(servicePath);
  let redirect;
  await handleShopOauthCallback({ query: { code: 'private-test-code', state: 'signed-state' } }, {
    redirect: (url) => { redirect = url; },
  });
  assert.equal(new URL(redirect).searchParams.get('shop_oauth_status'), 'error');
  assert.equal(recorded.app.id, 6);
  assert.deepEqual(recorded.scopes, ['seller.order.info']);
  assert.equal(recorded.httpStatus, 401);
  assert.equal(recorded.details.response.tiktok_code, 105005);
  assert.equal(recorded.details.request.requested_app_id, 6);
  assert.equal(JSON.stringify(recorded).includes('private-test-token'), false);
  assert.equal(JSON.stringify(recorded).includes('private-test-code'), false);
});
