const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('channel report revenue reads and aggregates the selected daily range from the database', async (t) => {
  const calls = [];
  const modelsPath = require.resolve('../src/models');
  const servicePath = require.resolve('../src/services/channelReportRevenueService');
  const restore = mockModule(modelsPath, {
    sequelize: {
      query: async (sql, options) => {
        calls.push({ sql, options });
        return [{ platform_video_id: 'video-1', revenue: '123.4500', currency: 'MYR' }];
      },
    },
  });
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restore();
  });

  const { loadMonthlyShopVideoRevenue } = require(servicePath);
  const result = await loadMonthlyShopVideoRevenue({
    startDate: '2026-07-01',
    endDate: '2026-08-01',
  });

  assert.deepEqual(result, {
    rows: [{ platform_video_id: 'video-1', revenue: 123.45, currency: 'MYR' }],
    errors: [],
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM channel_report_video_revenue_daily/);
  assert.match(calls[0].sql, /SUM\(revenue\)/);
  assert.deepEqual(calls[0].options.replacements, {
    startDate: '2026-07-01',
    endDate: '2026-08-01',
  });
});

test('video daily revenue includes zero days and calculates its selected-period summary', async (t) => {
  const calls = [];
  const modelsPath = require.resolve('../src/models');
  const servicePath = require.resolve('../src/services/channelReportRevenueService');
  const restore = mockModule(modelsPath, {
    sequelize: {
      query: async (sql, options) => {
        calls.push({ sql, options });
        return [
          {
            date: '2026-07-01', revenue: '10.5', currency: 'MYR', items_sold: '2', sku_orders: '1',
            products: [{ id: 'product-1', name: 'Product One' }],
            affiliate_items_sold: '2', affiliate_items_refunded: '0', affiliate_orders: '1',
            affiliate_products: [{ id: 'product-1', name: 'Product One', quantity: 2 }],
            affiliate_order_details: [{
              id: 'order-1', shop_id: 1, shop_name: 'Shop One', create_time: '2026-07-01T02:00:00.000Z',
              status: 'COMPLETED', quantity: '2', refunded_quantity: '0', gross_amount: '21', currency: 'MYR',
              products: [{ id: 'product-1', name: 'Product One', quantity: '2', gross_amount: '21', currency: 'MYR' }],
            }],
            affiliate_orders_available: true, revenue_available: true,
          },
          { date: '2026-07-02', revenue: '0', currency: 'MYR', items_sold: '0', sku_orders: '0', products: [], revenue_available: false },
          {
            date: '2026-07-03', revenue: '4.5', currency: 'MYR', items_sold: '1', sku_orders: '1',
            products: [{ id: 'product-2', name: 'Product Two' }],
            affiliate_items_sold: '1', affiliate_items_refunded: '0', affiliate_orders: '1',
            affiliate_products: [{ id: 'product-2', name: 'Product Two', quantity: 1 }],
            affiliate_orders_available: true, revenue_available: true,
          },
        ];
      },
    },
  });
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restore();
  });

  const { loadVideoDailyRevenue } = require(servicePath);
  const result = await loadVideoDailyRevenue({
    platformVideoId: 'video-1',
    startDate: '2026-07-01',
    endDate: '2026-07-04',
  });

  assert.equal(result.revenue, 15);
  assert.equal(result.revenue_days, 2);
  assert.equal(result.synced_days, 2);
  assert.equal(result.items_sold, 3);
  assert.equal(result.sku_orders, 2);
  assert.equal(result.days[0].products[0].id, 'product-1');
  assert.equal(result.days[0].orders[0].id, 'order-1');
  assert.equal(result.days[0].orders[0].quantity, 2);
  assert.equal(result.days[0].orders[0].products[0].gross_amount, 21);
  assert.deepEqual(result.days[1].orders, []);
  assert.equal(result.days.length, 3);
  assert.match(calls[0].sql, /generate_series/);
  assert.match(calls[0].sql, /affiliate_daily_orders/);
  assert.deepEqual(calls[0].options.replacements, {
    platformVideoId: 'video-1',
    startDate: '2026-07-01',
    endDate: '2026-07-04',
  });
});
