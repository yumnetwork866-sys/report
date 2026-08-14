const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadService = (t, getShopVideoPerformance, modelOverrides = {}) => {
  const modelsPath = require.resolve('../src/models');
  const shopServicePath = require.resolve('../src/services/tiktokShopService');
  const analyticsServicePath = require.resolve('../src/services/tiktokShopAnalyticsSyncService');
  const fixturesPath = require.resolve('../src/lib/tiktokDemoFixtures');
  const servicePath = require.resolve('../src/services/channelReportRevenueSyncService');
  const restores = [
    mockModule(modelsPath, {
      ChannelReportVideoRevenueDaily: { destroy: async () => {}, bulkCreate: async () => {} },
      ChannelReportRevenueSyncDay: { findAll: async () => [], upsert: async () => {} },
      sequelize: { transaction: async (callback) => callback({}) },
      ...modelOverrides,
    }),
    mockModule(shopServicePath, { getShopVideoPerformance }),
    mockModule(analyticsServicePath, {
      scheduledAnalyticsRange: () => ({ startDate: '2026-07-02', endDate: '2026-08-01' }),
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

test('daily revenue sync follows every page and deduplicates linked account videos', async (t) => {
  const calls = [];
  const pages = {
    'OFFICIAL_ACCOUNTS:first': {
      videos: [{ id: 'official-1', gmv: { amount: '10' } }, { id: 'shared', gmv: { amount: '20' } }],
      next_page_token: 'official-2',
    },
    'OFFICIAL_ACCOUNTS:official-2': { videos: [{ id: 'official-2', gmv: { amount: '30' } }] },
    'MARKETING_ACCOUNTS:first': {
      videos: [{ id: 'marketing-1', gmv: { amount: '40' } }],
      next_page_token: 'marketing-2',
    },
    'MARKETING_ACCOUNTS:marketing-2': {
      videos: [{ id: 'shared', gmv: { amount: '60' } }],
    },
  };
  const service = loadService(t, async (options) => {
    calls.push(options);
    return { data: pages[`${options.accountType}:${options.pageToken || 'first'}`] };
  });

  const videos = await service.__test.loadRevenueDay({ cipher: 'cipher', authorization: {} }, '2026-07-31');

  assert.deepEqual(calls.map(({ accountType, pageToken }) => [accountType, pageToken]), [
    ['OFFICIAL_ACCOUNTS', undefined],
    ['MARKETING_ACCOUNTS', undefined],
    ['OFFICIAL_ACCOUNTS', 'official-2'],
    ['MARKETING_ACCOUNTS', 'marketing-2'],
  ]);
  calls.forEach((call) => {
    assert.equal(call.startDate, '2026-07-31');
    assert.equal(call.endDate, '2026-08-01');
    assert.equal(call.pageSize, 100);
  });
  assert.deepEqual(videos.map((video) => video.id), ['official-1', 'shared', 'official-2', 'marketing-1']);
  assert.equal(videos.find((video) => video.id === 'shared').gmv.amount, '60');
  assert.equal(videos.find((video) => video.id === 'shared').account_type, 'MARKETING_ACCOUNTS');
});

test('daily revenue sync rejects repeated page tokens and enforces its page limit', async (t) => {
  let calls = 0;
  const service = loadService(t, async () => {
    calls += 1;
    return { data: { videos: [], next_page_token: `token-${Math.min(calls, 2)}` } };
  });

  await assert.rejects(
    service.__test.loadAccountRevenue({}, {}, 'OFFICIAL_ACCOUNTS', { maxPages: 3 }),
    /repeated video page token/,
  );
  assert.equal(calls, 3);
});

test('daily revenue sync accepts TikTok zero-result pages that omit the videos field', async (t) => {
  const service = loadService(t, async () => ({
    code: 0,
    data: { total_count: 0, next_page_token: null },
  }));
  const videos = await service.__test.loadAccountRevenue({}, {}, 'OFFICIAL_ACCOUNTS');
  assert.deepEqual(videos, []);
});

test('sync date selection refreshes recent days and backfills missing history', async (t) => {
  const service = loadService(t, async () => ({ data: { videos: [] } }));
  const dates = service.__test.selectSyncDates({
    endDate: '2026-08-01',
    existingDates: ['2026-07-31', '2026-07-30'],
    historyDays: 10,
    refreshDays: 2,
    initialBackfillDays: 5,
    backfillDays: 3,
  });
  assert.deepEqual(dates, [
    '2026-07-31',
    '2026-07-30',
    '2026-07-29',
    '2026-07-28',
    '2026-07-27',
  ]);
});

test('persisting a day replaces it atomically and records zero-result coverage', async (t) => {
  const events = [];
  const service = loadService(t, async () => ({ data: { videos: [] } }), {
    ChannelReportVideoRevenueDaily: {
      destroy: async (options) => events.push(['destroy', options]),
      bulkCreate: async () => events.push(['bulkCreate']),
    },
    ChannelReportRevenueSyncDay: {
      findAll: async () => [],
      upsert: async (values, options) => events.push(['coverage', values, options]),
    },
    sequelize: {
      transaction: async (callback) => {
        events.push(['transaction']);
        return callback({ id: 'tx' });
      },
    },
  });

  const count = await service.__test.persistRevenueDay({ id: 9 }, '2026-07-31', []);
  assert.equal(count, 0);
  assert.deepEqual(events.map((event) => event[0]), ['transaction', 'destroy', 'coverage']);
  assert.equal(events[1][1].transaction.id, 'tx');
  assert.equal(events[2][1].video_count, 0);
  assert.equal(events[2][2].transaction.id, 'tx');
});
