const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveShopAuthorization,
  getShopCapabilitiesStatus,
  getShopScopeAudit,
  SELLER_ORDER_SCOPE,
  SELLER_COMPASS_SCOPE,
  SELLER_ANALYTICS_SCOPE,
  SELLER_AFFILIATE_SCOPE,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
} = require('../src/services/tiktokShopAuthResolver');

test('resolveShopAuthorization routes jobs to the correct app by scope and capability', () => {
  const orderAuth = {
    id: 101,
    app_id: 1,
    app_type: 'custom',
    granted_scopes: [SELLER_ORDER_SCOPE],
    refresh_token_expires_at: new Date(Date.now() + 86400000),
    app: { id: 1, name: 'TikTok US OMS', capabilities: ['orders'] },
  };

  const compassAuth = {
    id: 102,
    app_id: 2,
    app_type: 'partner',
    granted_scopes: [SELLER_COMPASS_SCOPE, SELLER_ANALYTICS_SCOPE, SELLER_AFFILIATE_SCOPE],
    refresh_token_expires_at: new Date(Date.now() + 86400000),
    app: { id: 2, name: 'TikTok US Partner', capabilities: ['compass', 'analytics', 'affiliate'] },
  };

  const shop = {
    id: 99,
    name: 'US Beauty Store',
    region: 'US',
    authorization: compassAuth,
    orderAuthorization: orderAuth,
  };

  // 1. Order Job routes to Order Auth
  const resolvedOrder = resolveShopAuthorization(shop, { jobKey: 'tiktok_affiliate_orders' });
  assert.equal(resolvedOrder.id, 101);
  assert.equal(resolvedOrder.app.name, 'TikTok US OMS');

  // 2. Revenue Job routes to Order Auth (needs order/finance scope)
  const resolvedRevenue = resolveShopAuthorization(shop, { jobKey: 'tiktok_channel_report_revenue' });
  assert.equal(resolvedRevenue.id, 101);

  // 3. Creator Compass Job routes to Compass Auth
  const resolvedCompass = resolveShopAuthorization(shop, { jobKey: 'tiktok_creator_performance' });
  assert.equal(resolvedCompass.id, 102);
  assert.equal(resolvedCompass.app.name, 'TikTok US Partner');

  // 4. Shop Analytics Job routes to Analytics Auth
  const resolvedAnalytics = resolveShopAuthorization(shop, { jobKey: 'tiktok_shop_analytics' });
  assert.equal(resolvedAnalytics.id, 102);

  // 5. Capability status generates complete overview for UI
  const status = getShopCapabilitiesStatus(shop);
  assert.equal(status.orders.connected, true);
  assert.equal(status.orders.appName, 'TikTok US OMS');
  assert.equal(status.orders.hasRequiredScope, true);

  assert.equal(status.compass.connected, true);
  assert.equal(status.compass.appName, 'TikTok US Partner');
  assert.equal(status.compass.hasRequiredScope, true);

  assert.equal(status.analytics.connected, true);
  assert.equal(status.analytics.appName, 'TikTok US Partner');

  assert.equal(status.affiliate.connected, true);
  assert.equal(status.affiliate.appName, 'TikTok US Partner');
});

test('resolveShopAuthorization handles expired tokens and missing scopes', () => {
  const expiredOrderAuth = {
    id: 201,
    app_id: 1,
    granted_scopes: [SELLER_ORDER_SCOPE],
    refresh_token_expires_at: new Date(Date.now() - 3600000), // Expired!
  };

  const activeCompassAuth = {
    id: 202,
    app_id: 2,
    granted_scopes: [SELLER_COMPASS_SCOPE],
    refresh_token_expires_at: new Date(Date.now() + 86400000),
  };

  const shop = {
    id: 100,
    name: 'Expired Store',
    authorization: activeCompassAuth,
    orderAuthorization: expiredOrderAuth,
  };

  // Status flags expired token
  const status = getShopCapabilitiesStatus(shop);
  assert.equal(status.orders.expired, true);
  assert.equal(status.compass.expired, false);
});

test('getShopScopeAudit identifies granted scopes, missing scopes, and suggests matching apps', () => {
  const shopUS = {
    id: 50,
    name: 'US Fashion Store',
    region: 'US',
    authorization: {
      id: 501,
      app_id: 10,
      granted_scopes: [SELLER_ORDER_SCOPE],
      refresh_token_expires_at: new Date(Date.now() + 86400000),
      app: { id: 10, name: 'TikTok US OMS', region: 'US', app_key: 'us_oms_key' },
    },
    orderAuthorization: null,
  };

  const availableApps = [
    {
      id: 10,
      name: 'TikTok US OMS',
      region: 'US',
      app_key: 'us_oms_key',
      declared_scopes: [SELLER_ORDER_SCOPE],
      is_active: true,
    },
    {
      id: 20,
      name: 'TikTok US Partner',
      region: 'US',
      app_key: 'us_partner_key',
      declared_scopes: [SELLER_COMPASS_SCOPE, SELLER_ANALYTICS_SCOPE, SELLER_AFFILIATE_SCOPE],
      is_active: true,
    },
    {
      id: 30,
      name: 'TikTok VN Partner',
      region: 'VN',
      app_key: 'vn_partner_key',
      declared_scopes: [SELLER_COMPASS_SCOPE],
      is_active: true,
    },
  ];

  const audit = getShopScopeAudit(shopUS, availableApps);
  assert.equal(audit.is_fully_authorized, false);

  // 1. Granted scopes check
  const grantedOrder = audit.granted_scopes.find((s) => s.scope === SELLER_ORDER_SCOPE);
  assert.ok(grantedOrder);
  assert.equal(grantedOrder.provider.appName, 'TikTok US OMS');

  // 2. Missing scopes check
  const missingCompass = audit.missing_scopes.find((s) => s.scope === SELLER_COMPASS_SCOPE);
  assert.ok(missingCompass);
  assert.deepEqual(missingCompass.affectedJobs, ['tiktok_creator_performance']);

  // 3. Candidate app suggestion only suggests active apps for US region
  assert.equal(missingCompass.suggestedApps.length, 1);
  assert.equal(missingCompass.suggestedApps[0].id, 20);
  assert.equal(missingCompass.suggestedApps[0].name, 'TikTok US Partner');
});

test('shop with seller.affiliate_collaboration.read satisfies compass scope via EQUIVALENT_SCOPES', () => {
  const shopMY = {
    id: 60,
    name: 'Actiscar Malaysia',
    region: 'MY',
    authorization: {
      id: 601,
      app_id: 1,
      granted_scopes: [
        SELLER_ANALYTICS_SCOPE,
        SELLER_AFFILIATE_SCOPE, // In SEA/MY, compass offline tasks use affiliate collaboration
        SELLER_CREATOR_MARKETPLACE_SCOPE,
      ],
      refresh_token_expires_at: new Date(Date.now() + 86400000),
      app: { id: 1, name: 'TikTok Seller Malaysia', region: 'MY' },
    },
    orderAuthorization: {
      id: 602,
      app_id: 2,
      granted_scopes: [SELLER_ORDER_SCOPE],
      refresh_token_expires_at: new Date(Date.now() + 86400000),
      app: { id: 2, name: 'TikTok OMS Malaysia', region: 'MY' },
    },
  };

  // 1. resolveShopAuthorization resolves creator performance to the auth with affiliate scope
  const resolved = resolveShopAuthorization(shopMY, { jobKey: 'tiktok_creator_performance' });
  assert.ok(resolved);
  assert.equal(resolved.id, 601);
  assert.equal(resolved.app.name, 'TikTok Seller Malaysia');

  // 2. Capabilities overview shows compass as having required scope
  const status = getShopCapabilitiesStatus(shopMY);
  assert.equal(status.compass.connected, true);
  assert.equal(status.compass.hasRequiredScope, true);

  // 3. Audit treats compass requirement as satisfied, reporting fully authorized
  const audit = getShopScopeAudit(shopMY, []);
  assert.equal(audit.is_fully_authorized, true);
  assert.equal(audit.missing_scopes.length, 0);

  const compassGranted = audit.granted_scopes.find((s) => s.scope === SELLER_COMPASS_SCOPE);
  assert.ok(compassGranted);
  assert.equal(compassGranted.provider.appName, 'TikTok Seller Malaysia');
});


