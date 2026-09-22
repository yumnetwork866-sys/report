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
});
