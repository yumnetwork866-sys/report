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
