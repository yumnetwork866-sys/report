const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { mockModule } = require('./helpers/mockModule');

const fixture = (t, { appId = 6, appType = 'partner_vn', scopes = ['seller.order.info'], returnedShops = [{ id: 'shop-1', cipher: 'cipher-1' }] } = {}) => {
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const models = require('../src/models');
  t.mock.method(models.TikTokApp, 'findByPk', async (id) => ({ id, name: `app-${id}` }));
  t.mock.method(console, 'error', () => {});
  const authorizations = [{
    id: 1, app_id: 5, app_type: 'partner', open_id: 'seller-open-id',
    async update(values) { Object.assign(this, values); return this; },
  }];
  const shops = [{
    id: 7, platform_shop_id: 'shop-1', authorization_id: 1, order_authorization_id: null, cipher: 'cipher-1',
    async update(values) { Object.assign(this, values); return this; },
  }, {
    id: 8, platform_shop_id: 'shop-2', authorization_id: 1, order_authorization_id: null, cipher: 'cipher-2',
    async update(values) { Object.assign(this, values); return this; },
  }];
  const lookups = [];
  let created = 0;
  const restores = [
    mockModule(require.resolve('../src/services/tiktokShopService'), {
      parseShopAuthorizationState: () => ({ appId, appType, oauthType: 'shop', returnPath: '/manage/connections' }),
      exchangeShopAuthorizationCode: async () => ({ user_type: 0, open_id: 'seller-open-id', granted_scopes: scopes }),
      shopTokenFields: (token) => ({ open_id: token.open_id, granted_scopes: token.granted_scopes }),
      getAuthorizedShops: async () => returnedShops,
    }),
    mockModule(require.resolve('../src/services/tiktokAppService'), { autoSyncAppFromConnection: async () => {} }),
    mockModule(require.resolve('../src/services/authLogService'), { recordAuthLog: async () => {} }),
    mockModule(require.resolve('../src/repositories/tiktokShopRepository'), {
      findShopAuthorization: async ({ where }) => {
        lookups.push(where);
        return authorizations.find((row) => Object.entries(where).every(([key, value]) => row[key] === value));
      },
      transaction: async (operation) => operation({}),
      createShopAuthorization: async (values) => {
        created++;
        const row = { ...values, id: 10 + created, async update(updates) { Object.assign(this, updates); return this; } };
        authorizations.push(row);
        return row;
      },
      findShop: async ({ where }) => shops.find((row) => row.platform_shop_id === where.platform_shop_id),
      upsertShop: async () => assert.fail('existing Shops should not be recreated'),
      destroyShops: async () => assert.fail('reauthorization must never delete Shop data'),
      updateShops: async (values, { where }) => {
        for (const shop of shops) {
          const excluded = where.platform_shop_id?.[Op.notIn] || [];
          if (Object.entries(where).filter(([key]) => key !== 'platform_shop_id').every(([key, value]) => shop[key] === value)
            && !excluded.includes(shop.platform_shop_id)) Object.assign(shop, values);
        }
      },
    }),
  ];
  delete require.cache[servicePath];
  t.after(() => { delete require.cache[servicePath]; restores.reverse().forEach((restore) => restore()); });
  const service = require(servicePath);
  return {
    shops, authorizations, lookups,
    run: async () => {
      let redirected;
      await service.handleShopOauthCallback({ query: { code: 'code', state: 'state' } }, { redirect(url) { redirected = new URL(url); } });
      return redirected;
    },
  };
};

test('adding OMS with the same open_id and app type keeps the Seller connection', async (t) => {
  const f = fixture(t, { appType: 'partner' });
  const redirect = await f.run();
  assert.notEqual(redirect.searchParams.get('shop_oauth_status'), 'error');
  assert.deepEqual(f.lookups[0], { open_id: 'seller-open-id', app_id: 6 });
  assert.equal(f.authorizations.length, 2);
  assert.equal(f.authorizations[0].app_id, 5);
  assert.equal(f.shops[0].authorization_id, 1);
  assert.equal(f.shops[0].order_authorization_id, 11);
  assert.equal(f.shops[1].authorization_id, 1);
});

test('reconnecting Seller across a legacy app_type alias reuses its own connection and retains OMS', async (t) => {
  const f = fixture(t, { appId: 5, scopes: ['data.shop_analytics.public.read'] });
  f.shops[0].order_authorization_id = 22;
  await f.run();
  assert.equal(f.authorizations.length, 1);
  assert.equal(f.authorizations[0].id, 1);
  assert.equal(f.shops[0].authorization_id, 1);
  assert.equal(f.shops[0].order_authorization_id, 22);
  assert.equal(f.shops.length, 2);
  assert.equal(f.shops[1].authorization_id, 1);
  assert.equal(f.shops[1].last_sync_status, 'failed');
});

test('an empty authorized Shop list keeps all previous connections untouched', async (t) => {
  const f = fixture(t, { appId: 5, returnedShops: [] });
  const redirect = await f.run();
  assert.equal(redirect.searchParams.get('shop_oauth_status'), 'error');
  assert.equal(f.authorizations.length, 1);
  assert.equal(f.authorizations[0].app_type, 'partner');
  assert.equal(f.shops[0].authorization_id, 1);
  assert.equal(f.shops[0].order_authorization_id, null);
});

test('legacy OAuth without an app_id cannot overwrite a registered app connection', async (t) => {
  const f = fixture(t, { appId: null, appType: 'partner' });
  await f.run();
  assert.deepEqual(f.lookups[0], { open_id: 'seller-open-id', app_id: null, app_type: 'partner' });
  assert.equal(f.authorizations.length, 2);
  assert.equal(f.authorizations[0].app_id, 5);
});
