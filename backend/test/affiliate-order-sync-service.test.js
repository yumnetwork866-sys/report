const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadService = (t, searchAffiliateOrders, modelOverrides = {}) => {
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
    mockModule(shopServicePath, { searchAffiliateOrders }),
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
  assert.deepEqual(dates, ['2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09']);
});
