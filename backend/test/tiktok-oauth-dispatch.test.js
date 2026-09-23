const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('the shared TikTok Partner callback dispatches Seller state to the Shop handler', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const partnerServicePath = require.resolve('../src/services/tiktokPartnerService');
  const shopServicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const bookingControllerPath = require.resolve('../src/controllers/bookingController');
  const bookingEndpointServicePath = require.resolve('../src/services/booking/bookingEndpointService');
  const bookingRepositoryPath = require.resolve('../src/repositories/bookingRepository');
  let shopHandlerCalls = 0;

  const restores = [
    mockModule(modelsPath, {}),
    mockModule(partnerServicePath, {
      parseAuthorizationState: () => ({ oauthType: 'shop', returnPath: '/manage/shop-analytics' }),
    }),
    mockModule(shopServicePath, {
      handleShopOauthCallback: async (_req, res) => {
        shopHandlerCalls += 1;
        return res.redirect('/manage/shop-analytics');
      },
    }),
  ];
  delete require.cache[bookingControllerPath];
  delete require.cache[bookingEndpointServicePath];
  delete require.cache[bookingRepositoryPath];
  t.after(() => {
    delete require.cache[bookingControllerPath];
    delete require.cache[bookingEndpointServicePath];
    delete require.cache[bookingRepositoryPath];
    restores.reverse().forEach((restore) => restore());
  });

  const { handleTikTokPartnerOauthCallback } = require(bookingControllerPath);
  let redirectedTo = null;
  await handleTikTokPartnerOauthCallback(
    { query: { code: 'seller-code', state: 'signed-shop-state' } },
    { redirect: (url) => { redirectedTo = url; return url; } },
  );

  assert.equal(shopHandlerCalls, 1);
  assert.equal(redirectedTo, '/manage/shop-analytics');
});

test('the shared TikTok Partner callback dispatches custom OMS state to the Shop handler', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const partnerServicePath = require.resolve('../src/services/tiktokPartnerService');
  const shopServicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const bookingControllerPath = require.resolve('../src/controllers/bookingController');
  const bookingEndpointServicePath = require.resolve('../src/services/booking/bookingEndpointService');
  const bookingRepositoryPath = require.resolve('../src/repositories/bookingRepository');
  let shopHandlerCalls = 0;

  const restores = [
    mockModule(modelsPath, {}),
    mockModule(partnerServicePath, {
      parseAuthorizationState: () => { throw new Error('Partner state parser must not handle custom OMS state.'); },
    }),
    mockModule(shopServicePath, {
      handleShopOauthCallback: async (_req, res) => {
        shopHandlerCalls += 1;
        return res.redirect('/shop/orders');
      },
    }),
  ];
  delete require.cache[bookingControllerPath];
  delete require.cache[bookingEndpointServicePath];
  delete require.cache[bookingRepositoryPath];
  t.after(() => {
    delete require.cache[bookingControllerPath];
    delete require.cache[bookingEndpointServicePath];
    delete require.cache[bookingRepositoryPath];
    restores.reverse().forEach((restore) => restore());
  });

  const { handleTikTokPartnerOauthCallback } = require(bookingControllerPath);
  let redirectedTo = null;
  const customPayload = Buffer.from(JSON.stringify({
    oauthType: 'shop_custom', appType: 'custom', returnPath: '/shop/orders',
  })).toString('base64url');
  await handleTikTokPartnerOauthCallback(
    { query: { code: 'oms-code', state: `${customPayload}.custom-signature` } },
    { redirect: (url) => { redirectedTo = url; return url; } },
  );

  assert.equal(shopHandlerCalls, 1);
  assert.equal(redirectedTo, '/shop/orders');
});

test('Creator callback updates the KOC selected in signed state without creating a duplicate', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const partnerServicePath = require.resolve('../src/services/tiktokPartnerService');
  const shopServicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const bookingControllerPath = require.resolve('../src/controllers/bookingController');
  const bookingEndpointServicePath = require.resolve('../src/services/booking/bookingEndpointService');
  const bookingRepositoryPath = require.resolve('../src/repositories/bookingRepository');
  const creator = { id: 42, role: 'koc' };
  let createdUsers = 0;
  let savedValues = null;
  const authorization = {
    id: 7,
    creator_id: 42,
    username: 'old-name',
    update: async (values) => { savedValues = values; },
  };
  const restores = [
    mockModule(modelsPath, {
      User: {
        findOne: async ({ where }) => where.id === 42 && where.role === 'koc' ? creator : null,
        findByPk: async () => null,
        create: async () => { createdUsers += 1; return { id: 99 }; },
      },
      Booking: {},
      TikTokPartnerAuthorization: {
        findOne: async ({ where }) => where.open_id ? null : authorization,
        create: async () => { throw new Error('authorization should be updated'); },
      },
      TikTokShop: { findOne: async () => ({ platform_shop_id: 'seller-shop-1' }) },
      sequelize: { query: async () => {} },
    }),
    mockModule(partnerServicePath, {
      parseAuthorizationState: () => ({ oauthType: 'creator', returnPath: '/manage/koc-performance', creator_id: 42, create_koc: false }),
      exchangeAuthorizationCode: async () => ({ access_token: 'token', user_type: 1, granted_scopes: ['creator.affiliate.info'] }),
      getCreatorProfileWithAccessToken: async () => ({ creator_user_open_id: 'creator-open-id', username: 'TikTok name' }),
      tokenFields: () => ({ open_id: 'creator-open-id', access_token_encrypted: 'encrypted' }),
      CREATOR_PROFILE_SCOPE: 'creator.affiliate.info',
    }),
    mockModule(shopServicePath, { handleShopOauthCallback: async () => {} }),
  ];
  delete require.cache[bookingControllerPath];
  delete require.cache[bookingEndpointServicePath];
  delete require.cache[bookingRepositoryPath];
  t.after(() => {
    delete require.cache[bookingControllerPath];
    delete require.cache[bookingEndpointServicePath];
    delete require.cache[bookingRepositoryPath];
    restores.reverse().forEach((restore) => restore());
  });

  const { handleTikTokPartnerOauthCallback } = require(bookingControllerPath);
  let redirectedTo = null;
  await handleTikTokPartnerOauthCallback(
    { query: { code: 'creator-code', state: 'signed-creator-state' } },
    { redirect: (url) => { redirectedTo = url; return url; } },
  );

  assert.equal(createdUsers, 0);
  assert.equal(savedValues.creator_id, 42);
  assert.equal(savedValues.shop_id, 'seller-shop-1');
  assert.match(redirectedTo, /creator_id=42/);
});

test('Creator callback only creates a KOC for explicit create_koc state', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const partnerServicePath = require.resolve('../src/services/tiktokPartnerService');
  const shopServicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const bookingControllerPath = require.resolve('../src/controllers/bookingController');
  const bookingEndpointServicePath = require.resolve('../src/services/booking/bookingEndpointService');
  const bookingRepositoryPath = require.resolve('../src/repositories/bookingRepository');
  let createdUsers = 0;
  let authorizationValues = null;
  const restores = [
    mockModule(modelsPath, {
      User: {
        findOne: async () => null,
        findByPk: async () => null,
        create: async () => { createdUsers += 1; return { id: 51, role: 'koc' }; },
      },
      Booking: {},
      TikTokPartnerAuthorization: {
        findOne: async () => null,
        create: async (values) => { authorizationValues = values; return { id: 8 }; },
      },
      TikTokShop: { findOne: async () => null },
      sequelize: { query: async () => {} },
    }),
    mockModule(partnerServicePath, {
      parseAuthorizationState: () => ({ oauthType: 'creator', returnPath: '/manage/koc-performance', creator_id: null, create_koc: true }),
      exchangeAuthorizationCode: async () => ({ access_token: 'token', user_type: 1, granted_scopes: ['creator.affiliate.info'] }),
      getCreatorProfileWithAccessToken: async () => ({ creator_user_open_id: 'new-open-id', username: 'New creator' }),
      tokenFields: () => ({ open_id: 'new-open-id', access_token_encrypted: 'encrypted' }),
      CREATOR_PROFILE_SCOPE: 'creator.affiliate.info',
    }),
    mockModule(shopServicePath, { handleShopOauthCallback: async () => {} }),
  ];
  delete require.cache[bookingControllerPath];
  delete require.cache[bookingEndpointServicePath];
  delete require.cache[bookingRepositoryPath];
  t.after(() => {
    delete require.cache[bookingControllerPath];
    delete require.cache[bookingEndpointServicePath];
    delete require.cache[bookingRepositoryPath];
    restores.reverse().forEach((restore) => restore());
  });

  const { handleTikTokPartnerOauthCallback } = require(bookingControllerPath);
  await handleTikTokPartnerOauthCallback(
    { query: { code: 'creator-code', state: 'signed-create-state' } },
    { redirect: (url) => url },
  );

  assert.equal(createdUsers, 1);
  assert.equal(authorizationValues.creator_id, 51);
});
