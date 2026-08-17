const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadController = (t, query, revenueLoader = async () => ({
  rows: [{ platform_video_id: 'video-88', revenue: 12.5, currency: 'MYR' }],
  errors: [],
}), dailyRevenueLoader = async () => ({ days: [] })) => {
  const modelsPath = require.resolve('../src/models');
  const controllerPath = require.resolve('../src/controllers/reportController');
  const revenueServicePath = require.resolve('../src/services/channelReportRevenueService');
  const restoreModels = mockModule(modelsPath, {
    Booking: {},
    BookingVideo: {},
    BookingVideoPerformanceSnapshot: {},
    User: {},
    WeeklyReport: {},
    sequelize: { query },
  });
  const restoreRevenueService = mockModule(revenueServicePath, {
    loadMonthlyShopVideoRevenue: revenueLoader,
    loadVideoDailyRevenue: dailyRevenueLoader,
  });
  delete require.cache[controllerPath];
  t.after(() => {
    delete require.cache[controllerPath];
    restoreRevenueService();
    restoreModels();
  });
  return require(controllerPath);
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test('channel report aggregates server-side and returns only one video page', async (t) => {
  const calls = [];
  let revenueOptions;
  const { getChannelReport } = loadController(t, async (sql, options) => {
    calls.push({ sql, replacements: options.replacements });
    if (sql.includes('channel-report-summary')) {
      return [
        {
          row_type: 'summary',
          videos: '45',
          views: '12000',
          likes: '300',
          comments: '20',
          shares: '10',
          channels: '3',
          attributed_videos: '40',
          unclassified_videos: '5',
          revenue: '250.5',
          revenue_available: true,
          currency: 'MYR',
        },
        {
          row_type: 'chart',
          bucket: '2026-07-01',
          videos: '2',
          views: '500',
          likes: '30',
          comments: '2',
          shares: '1',
          channels: '1',
          attributed_videos: '2',
          unclassified_videos: '0',
          revenue: '25',
          revenue_available: true,
          currency: 'MYR',
        },
        {
          row_type: 'channel-option',
          bucket: '3',
          label: 'YUM',
          avatar_url: '/avatars/yum.jpg',
          videos: '45',
          views: '12000',
          likes: '300',
          comments: '20',
          shares: '10',
          channels: '1',
          attributed_videos: '40',
          unclassified_videos: '5',
          revenue: '250.5',
          revenue_available: true,
          currency: 'MYR',
        },
      ];
    }
    if (sql.includes('channel-report-teams')) {
      return [{
        team_id: 4,
        team_name: 'Content',
        user_id: 9,
        member_name: 'An',
        videos: '40',
        views: '11000',
        revenue: '250.5',
        revenue_available: true,
        currency: 'MYR',
        team_videos: '40',
        team_views: '11000',
        team_revenue: '250.5',
        team_revenue_available: true,
        team_currency: 'MYR',
      }];
    }
    return [{
      id: '88',
      platform: 'tiktok',
      platform_video_id: 'video-88',
      title: '#an Product review',
      published_at: '2026-07-10T10:00:00.000Z',
      views: '900',
      likes: '20',
      comments: '2',
      shares: '1',
      channel_id: '3',
      channel_username: 'yum',
      channel_name: 'YUM',
      attributions: [
        { user_id: 9, member_name: 'An', team_id: 4 },
        { user_id: 10, member_name: 'Binh', team_id: 4 },
      ],
      revenue: '12.5',
      currency: 'MYR',
      total_count: '45',
    }];
  }, async (options) => {
    revenueOptions = options;
    return {
      rows: [{ platform_video_id: 'video-88', revenue: 12.5, currency: 'MYR' }],
      errors: [],
    };
  });
  const response = makeResponse();

  await getChannelReport({
    query: { month: '2026-07', team_id: '4', user_id: '9', channel_ids: '3', page: '2', page_size: '20' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(revenueOptions, {
    startDate: '2026-07-01',
    endDate: '2026-08-01',
  });
  assert.equal(calls.length, 3);
  calls.forEach((call) => {
    assert.equal(call.replacements.startDate, '2026-07-01');
    assert.equal(call.replacements.endDateExclusive, '2026-08-01');
    assert.equal(call.replacements.teamId, 4);
    assert.equal(call.replacements.userId, 9);
    assert.equal(call.replacements.filterChannels, true);
    assert.deepEqual(JSON.parse(call.replacements.channelIds), [3]);
    assert.deepEqual(JSON.parse(call.replacements.revenueRows), [{
      platform_video_id: 'video-88',
      gross_gmv: 12.5,
      currency: 'MYR',
    }]);
  });
  const videoCall = calls.find((call) => call.sql.includes('channel-report-videos'));
  assert.equal(videoCall.replacements.limit, 20);
  assert.equal(videoCall.replacements.offset, 20);
  assert.equal(response.body.kpis.videos, 45);
  assert.equal(response.body.chart[0].views, 500);
  assert.equal(response.body.revenue.teams[0].members[0].name, 'An');
  assert.equal(response.body.filters.user_id, 9);
  assert.deepEqual(response.body.filters.channel_ids, [3]);
  assert.deepEqual(response.body.filters.channels, [{
    id: 3,
    name: 'YUM',
    avatar_url: '/avatars/yum.jpg',
  }]);
  assert.deepEqual(response.body.filters.users, [{
    id: 9,
    name: 'An',
    team_id: 4,
    team_name: 'Content',
  }]);
  assert.equal(response.body.videos.items.length, 1);
  assert.equal(response.body.videos.items[0].revenue.amount, 12.5);
  assert.deepEqual(response.body.videos.items[0].attribution, {
    user_id: 9, member_name: 'An', team_id: 4,
  });
  assert.deepEqual(response.body.videos.items[0].attributions, [
    { user_id: 9, member_name: 'An', team_id: 4 },
    { user_id: 10, member_name: 'Binh', team_id: 4 },
  ]);
  assert.deepEqual(response.body.period, {
    mode: 'month', month: '2026-07', start: '2026-07-01', end: '2026-07-31',
  });
  assert.deepEqual(response.body.videos.pagination, {
    page: 2,
    page_size: 20,
    total: 45,
    total_pages: 3,
  });
});

test('channel report attributes adjacent and multiple hashtags without duplicating base videos', async (t) => {
  const calls = [];
  const { getChannelReport } = loadController(t, async (sql) => {
    calls.push(sql);
    return [];
  }, async () => ({ rows: [], errors: [] }));
  const response = makeResponse();

  await getChannelReport({ query: { month: '2026-07' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 3);
  for (const sql of calls) {
    assert.ok(sql.includes('regexp_matches('));
    assert.ok(sql.includes("'(#[[:alnum:]_]+)'"));
    assert.ok(sql.includes("'gi'"));
    assert.match(sql, /video_attributions AS MATERIALIZED/);
    assert.doesNotMatch(sql, /ORDER BY rule\.user_id ASC\s+LIMIT 1/);
  }
  const summarySql = calls.find((sql) => sql.includes('channel-report-summary'));
  assert.match(summarySql, /FROM filtered_videos/);
  assert.match(summarySql, /jsonb_array_length\(attributions\) > 0/);
  const teamSql = calls.find((sql) => sql.includes('channel-report-teams'));
  assert.match(teamSql, /attribution_match\.user_id = app_user\.id/);
});

test('channel revenue report falls back to connected channel catalog videos with revenue in the selected dates', async (t) => {
  const calls = [];
  const { getChannelReport } = loadController(t, async (sql) => {
    calls.push(sql);
    return [];
  }, async () => ({
    rows: [{ platform_video_id: 'old-channel-video', revenue: 84.99, currency: 'MYR' }],
    errors: [],
  }));
  const response = makeResponse();

  await getChannelReport({
    query: { month: '2026-08', metric: 'revenue' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 3);
  for (const sql of calls) {
    assert.match(sql, /revenue_catalog_videos AS MATERIALIZED/);
    assert.match(sql, /FROM shop_videos shop_video/);
    assert.match(sql, /shop_video\.account_type IN \('OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS'\)/);
    assert.match(sql, /LOWER\(LTRIM\(BTRIM\(channel\.username\), '@'\)\)/);
    assert.match(sql, /NOT EXISTS \(\s*SELECT 1\s*FROM videos stored_video/);
    assert.match(sql, /WHERE \(:metric = 'revenue' AND revenue\.revenue > 0\)/);
    assert.match(sql, /UNION ALL\s*SELECT \*\s*FROM revenue_catalog_videos/);
  }
});

test('channel report rejects an invalid month before querying', async (t) => {
  let queried = false;
  const { getChannelReport } = loadController(t, async () => {
    queried = true;
    return [];
  });
  const response = makeResponse();

  await getChannelReport({ query: { month: '2026-13' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(queried, false);
  assert.match(response.body.message, /không hợp lệ/);
});

test('channel report member detail returns videos and product rollups lazily', async (t) => {
  const calls = [];
  const { getChannelReportMemberDetail } = loadController(t, async (sql, options) => {
    calls.push({ sql, replacements: options.replacements });
    if (sql.includes('channel-report-member-videos')) {
      return [{
        id: '88',
        platform_video_id: 'video-88',
        title: 'Review',
        published_at: '2026-07-10T10:00:00.000Z',
        views: '900',
        likes: '20',
        comments: '2',
        shares: '1',
        channel_id: '3',
        channel_username: 'yum',
        channel_name: 'YUM',
        revenue: '12.5',
        currency: 'MYR',
        products: [{ id: 2, name: 'Actiscar' }],
        total_count: '1',
      }];
    }
    return [{
      product_id: '2',
      name: 'Actiscar',
      videos: '1',
      views: '900',
      revenue: '12.5',
      revenue_available: true,
      currency: 'MYR',
    }];
  });
  const response = makeResponse();

  await getChannelReportMemberDetail({
    params: { userId: '9' },
    query: { month: '2026-07', team_id: '4', channel_ids: '3', metric: 'revenue', page: '1', page_size: '10' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 2);
  const videoCall = calls.find((call) => call.sql.includes('channel-report-member-videos'));
  assert.match(videoCall.sql, /ORDER BY video\.revenue DESC NULLS LAST, video\.published_at DESC, video\.id DESC/);
  calls.forEach((call) => {
    assert.equal(call.replacements.userId, 9);
    assert.equal(call.replacements.teamId, 4);
    assert.equal(call.replacements.metric, 'revenue');
    assert.deepEqual(JSON.parse(call.replacements.channelIds), [3]);
  });
  assert.equal(response.body.videos.items[0].products[0].name, 'Actiscar');
  assert.equal(response.body.videos.items[0].revenue.amount, 12.5);
  assert.equal(response.body.products[0].views, 900);
  assert.deepEqual(response.body.videos.pagination, {
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
});

test('channel report accepts an inclusive custom date range', async (t) => {
  const calls = [];
  const { getChannelReport } = loadController(t, async (sql, options) => {
    calls.push({ sql, replacements: options.replacements });
    return [];
  });
  const response = makeResponse();

  await getChannelReport({
    query: { start_date: '2026-07-05', end_date: '2026-07-12' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 3);
  calls.forEach((call) => {
    assert.equal(call.replacements.startDate, '2026-07-05');
    assert.equal(call.replacements.endDateExclusive, '2026-07-13');
  });
  assert.deepEqual(response.body.period, {
    mode: 'custom', month: null, start: '2026-07-05', end: '2026-07-12',
  });
});

test('channel report returns daily revenue for one video in the selected range', async (t) => {
  let dailyOptions;
  const { getChannelReportVideoDailyRevenue } = loadController(
    t,
    async () => [],
    undefined,
    async (options) => {
      dailyOptions = options;
      return {
        platform_video_id: options.platformVideoId,
        start_date: options.startDate,
        end_date: options.endDate,
        revenue: 15,
        currency: 'MYR',
        revenue_days: 1,
        synced_days: 2,
        days: [
          { date: '2026-07-05', revenue: 15, currency: 'MYR', revenue_available: true },
          { date: '2026-07-06', revenue: 0, currency: 'MYR', revenue_available: true },
        ],
      };
    },
  );
  const response = makeResponse();

  await getChannelReportVideoDailyRevenue({
    params: { platformVideoId: 'video-88' },
    query: { start_date: '2026-07-05', end_date: '2026-07-06' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(dailyOptions, {
    platformVideoId: 'video-88',
    startDate: '2026-07-05',
    endDate: '2026-07-07',
  });
  assert.equal(response.body.end_date, '2026-07-06');
  assert.equal(response.body.revenue, 15);
  assert.equal(response.body.days.length, 2);
});

test('channel report rejects incomplete and reversed custom ranges', async (t) => {
  let queried = false;
  const { getChannelReport } = loadController(t, async () => {
    queried = true;
    return [];
  });

  const incompleteResponse = makeResponse();
  await getChannelReport({ query: { start_date: '2026-07-05' } }, incompleteResponse);
  assert.equal(incompleteResponse.statusCode, 400);

  const reversedResponse = makeResponse();
  await getChannelReport({
    query: { start_date: '2026-07-12', end_date: '2026-07-05' },
  }, reversedResponse);
  assert.equal(reversedResponse.statusCode, 400);
  assert.equal(queried, false);
});
