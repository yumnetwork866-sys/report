const assert = require('node:assert/strict');
const test = require('node:test');
const { sequelize } = require('../src/models');
const { getDashboard } = require('../src/controllers/dashboardController');

test('dashboard compares every channel across matching periods without paginating the comparison', async (t) => {
  const groupedCalls = [];
  t.mock.method(sequelize, 'query', async (sql, options) => {
    if (sql.includes('GROUP BY v.channel_id')) {
      groupedCalls.push(options.replacements);
      if (options.replacements.startDate === '2026-11-01') return [
        { channel_id: 1, gross_gmv: '300', orders: '6', views: '1500', sales_currency: 'MYR' },
        { channel_id: 2, gross_gmv: '50', orders: '1', views: '0', sales_currency: 'MYR' },
      ];
      return [
        { channel_id: 1, gross_gmv: '600', orders: '12', views: '3000' },
        { channel_id: 3, gross_gmv: '100', orders: '2', views: '1000' },
      ];
    }
    if (sql.includes('FROM tiktok_channels channel')) return [
      { id: 3, username: 'declining' }, { id: 2, username: 'new' },
      { id: 1, username: 'leading' }, { id: 4, username: 'empty' },
    ];
    return [];
  });
  let payload;
  await getDashboard({ query: {
    metric: 'date', start_date: '2026-11-01', end_date: '2026-11-10', user_id: '7', page_size: '1',
  } }, {
    json: (value) => { payload = value; },
    status: () => { throw new Error('Dashboard request failed'); },
    setHeader: () => {},
  });
  assert.equal(groupedCalls.length, 2);
  assert.deepEqual(groupedCalls.map(({ startDate, endDate, userId, channelId }) => ({ startDate, endDate, userId, channelId })), [
    { startDate: '2026-11-01', endDate: '2026-11-10', userId: 7, channelId: null },
    { startDate: '2026-10-22', endDate: '2026-10-31', userId: 7, channelId: null },
  ]);
  assert.deepEqual(payload.channel_comparison.map(({ id, gross_gmv, orders, views, rpm, gmv_growth }) =>
    ({ id, gross_gmv, orders, views, rpm, gmv_growth })), [
    { id: 1, gross_gmv: 300, orders: 6, views: 1500, rpm: 200, gmv_growth: -50 },
    { id: 2, gross_gmv: 50, orders: 1, views: 0, rpm: 0, gmv_growth: null },
    { id: 3, gross_gmv: 0, orders: 0, views: 0, rpm: 0, gmv_growth: -100 },
    { id: 4, gross_gmv: 0, orders: 0, views: 0, rpm: 0, gmv_growth: 0 },
  ]);
});

test('single-channel dashboard skips comparison queries', async (t) => {
  t.mock.method(sequelize, 'query', async (sql) => {
    assert.ok(!sql.includes('GROUP BY v.channel_id'));
    return [];
  });
  let payload;
  await getDashboard({ query: { channel_id: '1' } }, {
    json: (value) => { payload = value; },
    status: () => { throw new Error('Dashboard request failed'); },
    setHeader: () => {},
  });
  assert.deepEqual(payload.channel_comparison, []);
});
