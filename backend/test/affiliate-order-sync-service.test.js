const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadService = (t, searchAffiliateOrders, modelOverrides = {}, shopServiceOverrides = {}) => {
  const modelsPath = require.resolve('../src/models');
  const shopServicePath = require.resolve('../src/services/tiktokShopService');
  const analyticsServicePath = require.resolve('../src/services/tiktokShopAnalyticsSyncService');
  const fixturesPath = require.resolve('../src/lib/tiktokDemoFixtures');
  const servicePath = require.resolve('../src/services/affiliateOrderSyncService');
  const restores = [
    mockModule(modelsPath, {
      TikTokAffiliateOrder: { destroy: async () => {}, bulkCreate: async () => [] },
      TikTokAffiliateOrderSku: { bulkCreate: async () => {} },
      TikTokAffiliateOrderSyncDay: { findAll: async () => [], upsert: async () => {} },
      sequelize: { transaction: async (callback) => callback({}) },
      ...modelOverrides,
    }),
    mockModule(shopServicePath, {
      searchAffiliateOrders,
      searchShopOrders: async () => ({ data: { orders: [] } }),
      SELLER_ORDER_SCOPE: 'seller.order.info',
      ...shopServiceOverrides,
    }),
    mockModule(analyticsServicePath, {
      scheduledAnalyticsRange: () => ({ startDate: '2026-07-15', endDate: '2026-08-14' }),
    }),
    mockModule(fixturesPath, {
      isDemoAuthorization: () => false,
      sellerAffiliateFixture: () => ({}),
    }),
  ];
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restores.reverse().forEach((restore) => restore());
  });
  return require(servicePath);
};

test('affiliate order sync follows every page for one local shop day', async (t) => {
  const calls = [];
  const service = loadService(t, async (options) => {
    calls.push(options);
    if (!options.pageToken) {
      return { data: { orders: [{ id: 'order-1', create_time: 1, skus: [] }], next_page_token: 'page-2' } };
    }
    return { data: { orders: [{ id: 'order-2', create_time: 2, skus: [] }], next_page_token: null } };
  });

  const result = await service.__test.loadOrderDay({
    region: 'MY', cipher: 'cipher', authorization: {},
  }, '2026-08-13');

  assert.deepEqual(result.orders.map((order) => order.id), ['order-1', 'order-2']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].startTime, Date.parse('2026-08-12T16:00:00.000Z') / 1000);
  assert.equal(calls[0].endTime, Date.parse('2026-08-13T16:00:00.000Z') / 1000);
  assert.equal(calls[0].pageSize, 100);
  assert.equal(calls[1].pageToken, 'page-2');
});

test('affiliate order sync handles empty days when TikTok omits the orders array', async (t) => {
  const service = loadService(t, async () => ({
    data: { next_page_token: '', total_count: 0 },
  }));

  const result = await service.__test.loadOrderDay({
    region: 'MY', cipher: 'cipher', authorization: {},
  }, '2026-08-13');

  assert.deepEqual(result.orders, []);
});

test('affiliate order sync replaces a day atomically and stores SKU video attribution', async (t) => {
  const events = [];
  const service = loadService(t, async () => ({ data: { orders: [] } }), {
    TikTokAffiliateOrder: {
      destroy: async (options) => events.push(['destroy', options]),
      bulkCreate: async (rows) => {
        events.push(['orders', rows]);
        return rows.map((row, index) => ({ ...row, id: index + 10 }));
      },
    },
    TikTokAffiliateOrderSku: {
      bulkCreate: async (rows) => events.push(['skus', rows]),
    },
    TikTokAffiliateOrderSyncDay: {
      findAll: async () => [],
      upsert: async (values) => events.push(['coverage', values]),
    },
    sequelize: { transaction: async (callback) => callback({ id: 'tx' }) },
  });

  const result = await service.__test.persistOrderDay({ id: 3 }, '2026-08-13', {
    startTime: 1786550400,
    endTime: 1786636800,
    orders: [{
      id: 'order-1', create_time: 1786554000,
      skus: [{
        sku_id: 'sku-1', product_id: 'product-1', quantity: 2,
        content_type: 'VIDEO', content_id: 'video-1', creator_username: 'creator',
        price: { amount: '12.50', currency: 'MYR' }, settlement_status: 'SETTLED',
      }],
    }],
  });

  assert.deepEqual(result, { order_count: 1, sku_count: 1 });
  assert.deepEqual(events.map((event) => event[0]), ['destroy', 'orders', 'skus', 'coverage']);
  const sku = events.find((event) => event[0] === 'skus')[1][0];
  assert.equal(sku.affiliate_order_id, 10);
  assert.equal(sku.content_type, 'VIDEO');
  assert.equal(sku.content_id, 'video-1');
  assert.equal(sku.price, 12.5);
  assert.equal(sku.currency, 'MYR');
});

test('affiliate order sync refreshes recent days and backfills missing days', async (t) => {
  const service = loadService(t, async () => ({ data: { orders: [] } }));
  const dates = service.__test.selectSyncDates({
    endDate: '2026-08-14',
    existingDates: ['2026-08-13', '2026-08-12'],
    historyDays: 10,
    refreshDays: 2,
    initialBackfillDays: 5,
    backfillDays: 3,
  });
  assert.deepEqual(dates, ['2026-08-14', '2026-08-13', '2026-08-11', '2026-08-10']);
});

test('shop order sync backfills the initial range when affiliate-only coverage already exists', async (t) => {
  const service = loadService(t, async () => ({ data: { orders: [] } }));
  const coverage = Array.from({ length: 10 }, (_, index) => ({
    metric_date: service.__test.shiftDate('2026-08-14', -index),
    affiliate_synced_at: new Date(),
    shop_order_synced_at: null,
  }));
  const dates = service.__test.selectSyncDates({
    endDate: '2026-08-14',
    coverage,
    includeShopOrders: true,
    historyDays: 10,
    refreshDays: 2,
    initialBackfillDays: 5,
    backfillDays: 3,
  });

  assert.deepEqual(dates, [
    '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10',
  ]);
});

test('affiliate refresh does not replace days that already contain Shop Orders when scope is unavailable', async (t) => {
  const service = loadService(t, async () => ({ data: { orders: [] } }));
  const dates = service.__test.selectSyncDates({
    endDate: '2026-08-14',
    coverage: [
      { metric_date: '2026-08-14', affiliate_synced_at: new Date(), shop_order_synced_at: new Date() },
      { metric_date: '2026-08-13', affiliate_synced_at: new Date(), shop_order_synced_at: new Date() },
    ],
    includeShopOrders: false,
    historyDays: 4,
    refreshDays: 2,
    initialBackfillDays: 4,
    backfillDays: 2,
  });

  assert.deepEqual(dates, ['2026-08-12', '2026-08-11']);
});

test('shop order sync merges direct orders with affiliate orders when scope is granted', async (t) => {
  const service = loadService(t, async () => ({
    data: {
      orders: [
        {
          id: 'order-affiliate-1',
          create_time: 1786554000,
          skus: [{
            sku_id: 'sku-1', product_id: 'prod-1', creator_username: 'super.creator',
            price: { amount: '50.00', currency: 'MYR' }, quantity: 1, content_type: 'VIDEO',
          }],
        },
      ],
      next_page_token: null,
    },
  }), {}, {
    searchShopOrders: async () => ({
      data: {
        orders: [
          {
            id: 'order-affiliate-1',
            create_time: 1786554000,
            line_items: [{ sku_id: 'sku-1', product_id: 'prod-1', sale_price: '50.00', quantity: 1 }],
          },
          {
            id: 'order-direct-2',
            create_time: 1786556000,
            order_status: 'COMPLETED',
            payment: { currency: 'MYR' },
            line_items: [
              { sku_id: 'sku-2', product_id: 'prod-2', product_name: 'Direct Item', sale_price: '75.00' },
              { sku_id: 'sku-2', product_id: 'prod-2', product_name: 'Direct Item', sale_price: '75.00' },
            ],
          },
        ],
        next_page_token: null,
      },
    }),
  });

  const result = await service.__test.loadOrderDay({
    region: 'MY',
    cipher: 'cipher',
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read', 'seller.order.info'] },
  }, '2026-08-13');

  assert.equal(result.orders.length, 2);
  const affiliate = result.orders.find((order) => order.id === 'order-affiliate-1');
  const direct = result.orders.find((order) => order.id === 'order-direct-2');
  assert.equal(affiliate.skus[0].creator_username, 'super.creator');
  assert.equal(affiliate.skus[0].content_type, 'VIDEO');
  assert.equal(affiliate.order_status, undefined);
  assert.equal(direct.skus[0].creator_username, null);
  assert.equal(direct.skus[0].content_type, 'DIRECT');
  assert.equal(direct.skus[0].product_name, 'Direct Item');
  assert.equal(direct.skus[0].price.amount, '75.00');
  assert.equal(direct.skus[0].price.currency, 'MYR');
  assert.equal(direct.skus[0].quantity, 2);
  assert.equal(direct.skus[0].settlement_status, 'COMPLETED');
});

test('shop order lifecycle status remains canonical when affiliate attribution is merged', async (t) => {
  const service = loadService(t, async () => ({
    data: {
      orders: [{ id: 'order-1', create_time: 1786554000, skus: [{ sku_id: 'sku-1', content_type: 'VIDEO' }] }],
      next_page_token: null,
    },
  }), {}, {
    searchShopOrders: async () => ({
      data: {
        orders: [{
          id: 'order-1', create_time: 1786554000, order_status: 'CANCELLED',
          line_items: [{ sku_id: 'sku-1', quantity: 1, sale_price: '10.00' }],
        }],
        next_page_token: null,
      },
    }),
  });

  const result = await service.__test.loadOrderDay({
    region: 'MY', cipher: 'cipher', authorization: { granted_scopes: ['seller.order.info'] },
  }, '2026-08-13');

  assert.equal(result.orders[0].order_status, 'CANCELLED');
  assert.equal(result.orders[0].skus[0].content_type, 'VIDEO');
  assert.equal(result.orders[0].is_direct, false);
});

test('shop order sync uses orderAuthorization (Custom App) when separate from partner authorization', async (t) => {
  let searchOrdersAuth = null;
  const service = loadService(t, async () => ({
    data: { orders: [], next_page_token: null },
  }), {}, {
    searchShopOrders: async ({ authorization }) => {
      searchOrdersAuth = authorization;
      return {
        data: {
          orders: [
            {
              id: 'order-custom-1',
              create_time: 1786556000,
              order_status: 'COMPLETED',
              payment: { currency: 'MYR' },
              line_items: [{ sku_id: 'sku-custom-1', sale_price: '100.00', quantity: 1 }],
            },
          ],
          next_page_token: null,
        },
      };
    },
  });

  const partnerAuth = { id: 1, app_type: 'partner', granted_scopes: ['seller.affiliate_collaboration.read'] };
  const customAuth = { id: 2, app_type: 'custom', granted_scopes: ['seller.order.info'] };

  const result = await service.__test.loadOrderDay({
    region: 'MY',
    cipher: 'cipher',
    authorization: partnerAuth,
    orderAuthorization: customAuth,
  }, '2026-08-13');

  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].id, 'order-custom-1');
  assert.equal(searchOrdersAuth, customAuth);
});
