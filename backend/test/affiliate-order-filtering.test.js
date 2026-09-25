const assert = require('node:assert/strict');
const test = require('node:test');
const { Op } = require('sequelize');

const { mockModule } = require('./helpers/mockModule');

test('database affiliate orders combine versatile search and quick filters', async (t) => {
  const repositoryPath = require.resolve('../src/repositories/tiktokShopRepository');
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const captured = {};
  const repository = {
    findShopWithAuthorization: async () => ({
      id: 9,
      authorization_id: 11,
      cipher: 'cipher',
      authorization: { id: 11, open_id: 'real-shop', updated_at: new Date(0) },
    }),
    findCreatorProfiles: async (options) => {
      captured.profiles = options;
      return [{ username: 'creator_one' }];
    },
    findAffiliateOrders: async (options) => {
      captured.searchOrders = options;
      return [{ order_id: 'order-100' }];
    },
    findAffiliateOrderSkus: async (options) => {
      captured.searchSkus = options;
      return [{ order_id: 'order-101' }];
    },
    findAndCountAffiliateOrders: async (options, skuWhere, skuRequired) => {
      captured.final = { options, skuWhere, skuRequired };
      return { count: 0, rows: [] };
    },
  };

  const restore = mockModule(repositoryPath, repository);
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restore();
  });

  const service = require(servicePath);
  const result = await service.execute('listAffiliateOrders', {
    params: { shopId: '9' },
    query: {
      source: 'db',
      keyword: 'Mina',
      content_type: 'LIVE',
      settlement_status: 'SETTLED',
      page_size: '20',
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.total_count, 0);
  assert.equal(captured.profiles.where[Op.or][0].username[Op.iLike], '%Mina%');
  assert.equal(captured.searchOrders.where.order_id[Op.iLike], '%Mina%');
  assert.deepEqual(captured.searchSkus.where[Op.or].at(-1).creator_username[Op.in], ['creator_one']);
  assert.deepEqual(captured.final.options.where.order_id[Op.in], ['order-100', 'order-101']);
  assert.equal(captured.final.options.limit, 20);
  assert.equal(captured.final.skuRequired, true);

  const conditions = captured.final.skuWhere[Op.and];
  assert.deepEqual(conditions[0].content_type[Op.in], ['LIVE', 'PRE_LIVE', 'LIVESTREAM', 'LIVE_STREAM']);
  assert.equal(conditions[1].fully_return, false);
  assert.equal(conditions[1].refunded_quantity, 0);
  assert.equal(conditions[1][Op.or][0].settlement_status[Op.iLike], 'SETTLED');
  assert.equal(conditions[1][Op.or][1].settlement_status[Op.iLike], 'COMPLETED');

  const overview = await service.execute('listAffiliateOrderOverview', {
    params: { shopId: '9' },
    query: {
      create_time_ge: '1788195600',
      create_time_lt: '1790874000',
      keyword: 'Mina',
      content_type: 'LIVE',
      settlement_status: 'SETTLED',
    },
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.kpis.orders, 0);
  assert.equal(overview.body.total_count, 0);
  assert.equal(captured.final.options.limit, 10000);
  assert.deepEqual(captured.final.options.where.order_id[Op.in], ['order-100', 'order-101']);

  await service.execute('listAffiliateOrders', {
    params: { shopId: '9' },
    query: { source: 'db', content_type: 'DIRECT' },
  });
  const directConditions = captured.final.skuWhere[Op.and];
  assert.deepEqual(directConditions[0].content_type[Op.in], ['DIRECT', 'ORGANIC', 'SHOP_ORGANIC', 'OTHER']);

  await service.execute('listAffiliateOrders', {
    params: { shopId: '9' },
    query: { source: 'db', content_type: 'AFFILIATE' },
  });
  const affiliateConditions = captured.final.skuWhere[Op.and];
  assert.deepEqual(affiliateConditions[0].content_type[Op.notIn], ['DIRECT', 'ORGANIC', 'SHOP_ORGANIC', 'OTHER']);

  await service.execute('listAffiliateOrders', {
    params: { shopId: '9' },
    query: {
      source: 'db',
      date_field: 'update_time',
      create_time_ge: '1788195600',
      create_time_lt: '1790874000',
      order_status: 'IN_TRANSIT',
      shipping_type: 'TIKTOK',
      warehouse: "WH'01",
      buyer_cancellation: 'yes',
      refund_status: 'no',
      carrier: 'J&T',
      product_sku: 'SKU-9',
      settlement_amount_min: '10',
      settlement_amount_max: '50',
      delivery_issue: 'yes',
    },
  });
  const orderSql = captured.final.options.where[Op.and].map((condition) => condition.val).join('\n');
  assert.match(orderSql, /update_time/);
  assert.match(orderSql, /IN_TRANSIT/);
  assert.match(orderSql, /shipping_type/);
  assert.match(orderSql, /WH''01/);
  assert.match(orderSql, /cancellation_initiator/);
  assert.match(orderSql, /NOT EXISTS/);
  assert.match(orderSql, /shipping_provider/);
  assert.match(orderSql, /settlement_amount/);
  assert.match(orderSql, /shipping_due_time/);
  assert.equal(captured.final.skuWhere[Op.and][0][Op.or][2].sku_id[Op.iLike], '%SKU-9%');
});

test('database order page hydrates Finance data only for finalized orders', async (t) => {
  const repositoryPath = require.resolve('../src/repositories/tiktokShopRepository');
  const shopApiPath = require.resolve('../src/services/tiktokShopService');
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const financeCalls = [];
  const repository = {
    findShopWithAuthorization: async () => ({
      id: 19,
      authorization_id: 21,
      cipher: 'shop-cipher',
      authorization: {
        id: 21,
        open_id: 'real-shop-finance',
        updated_at: new Date(0),
        granted_scopes: ['seller.order.info', 'seller.finance.info'],
      },
    }),
    findAndCountAffiliateOrders: async () => ({
      count: 2,
      rows: [
        {
          order_id: 'completed-1',
          create_time: new Date('2026-09-20T00:00:00Z'),
          raw_data: { order_status: 'COMPLETED', payment: { total_amount: '20', currency: 'MYR' } },
          skus: [],
        },
        {
          order_id: 'pending-1',
          create_time: new Date('2026-09-20T01:00:00Z'),
          raw_data: { order_status: 'AWAITING_SHIPMENT', payment: { total_amount: '10', currency: 'MYR' } },
          skus: [],
        },
      ],
    }),
  };
  const shopApi = {
    SELLER_FINANCE_SCOPE: 'seller.finance.info',
    getOrderStatementTransactions: async (options) => {
      financeCalls.push(options);
      return { data: { currency: 'MYR', settlement_amount: '15.50' } };
    },
  };

  const restoreRepository = mockModule(repositoryPath, repository);
  const restoreShopApi = mockModule(shopApiPath, shopApi);
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restoreShopApi();
    restoreRepository();
  });

  const service = require(servicePath);
  const result = await service.execute('listAffiliateOrders', {
    params: { shopId: '19' },
    query: { source: 'db', page_size: '20' },
  });

  assert.equal(result.status, 200);
  assert.equal(financeCalls.length, 1);
  assert.equal(financeCalls[0].orderId, 'completed-1');
  assert.equal(financeCalls[0].shopCipher, 'shop-cipher');
  assert.equal(result.body.orders[0].finance_status, 'AVAILABLE');
  assert.equal(result.body.orders[0].finance.settlement_amount, '15.50');
  assert.equal(result.body.orders[1].finance_status, 'PENDING');
});

test('top products group by Product ID and prefer SKU Finance settlement', async (t) => {
  const repositoryPath = require.resolve('../src/repositories/tiktokShopRepository');
  const servicePath = require.resolve('../src/services/tiktokShop/tiktokShopEndpointService');
  const restore = mockModule(repositoryPath, {});
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restore();
  });

  const { __test } = require(servicePath);
  const result = __test.productPerformance([{
    currency: 'MYR',
    finance: {
      currency: 'MYR',
      settlement_amount: '135',
      sku_transactions: [{ sku_id: 'sku-1', settlement_amount: '90', currency: 'MYR' }],
    },
    skus: [
      { sku_id: 'sku-1', product_id: 'product-1', quantity: 2, price: { amount: '50', currency: 'MYR' } },
      { sku_id: 'sku-2', product_id: 'product-2', quantity: 1, refunded_quantity: 1, price: { amount: '50', currency: 'MYR' } },
    ],
  }], [
    { product_id: 'product-1', title: 'Current One', image_url: 'one.jpg', raw_data: { status: 'ACTIVATE' } },
    { product_id: 'product-2', title: 'Current Two', image_url: 'two.jpg', raw_data: { status: 'SELLER_DEACTIVATED' } },
  ]);

  assert.equal(result.revenue[0].product_id, 'product-1');
  assert.deepEqual(result.revenue[0].gross_revenue, [{ currency: 'MYR', amount: 100 }]);
  assert.deepEqual(result.settlement.map((row) => [row.product_id, row.settlement[0].amount]), [
    ['product-1', 90],
    ['product-2', 45],
  ]);
  assert.equal(result.refund[0].product_id, 'product-2');
  assert.equal(result.refund[0].title, 'Current Two');
});
