const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadController = (
  t,
  models,
  shopService = {},
  bookingVideoService = {},
  creatorProfileService = {},
) => {
  const controllerPath = require.resolve('../src/controllers/bookingController');
  const restores = [
    mockModule(require.resolve('../src/models'), models),
    mockModule(require.resolve('../src/services/tiktokCreatorProfileService'), {
      normalizeCreatorProfile: (creator = {}) => ({
        creator_open_id: creator.creator_open_id || null,
        username: String(creator.username || '').trim().toLowerCase(),
        nickname: creator.nickname || null,
        avatar_url: creator.avatar_url || null,
      }),
      loadCreatorProfiles: async () => new Map(),
      ...creatorProfileService,
    }),
    mockModule(require.resolve('../src/services/tiktokPartnerService'), {}),
    mockModule(require.resolve('../src/services/tiktokShopService'), shopService),
    mockModule(require.resolve('../src/services/bookingVideoPerformanceService'), {
      autoLinkBookingVideos: async () => ({ status: 'no_match' }),
      recordBookingVideoMatch: async () => {},
      serializeBookingWithActual: (booking) => (
        typeof booking?.toJSON === 'function' ? booking.toJSON() : booking
      ),
      ...bookingVideoService,
    }),
    mockModule(require.resolve('../src/controllers/tiktokShopController'), {
      handleShopOauthCallback: async () => {},
    }),
  ];
  delete require.cache[controllerPath];
  t.after(() => {
    delete require.cache[controllerPath];
    restores.reverse().forEach((restore) => restore());
  });
  return require(controllerPath);
};

test('booking list uses the latest creator profile avatar instead of an expired snapshot URL', async (t) => {
  const bookingRows = [
    {
      id: 19,
      target_shop_id: 4,
      creator_open_id: 'creator-open-19',
      creator_username: 'fresh.creator',
      creator_avatar_url: 'https://example.test/expired-avatar.webp',
      evaluation_snapshot: {},
    },
    {
      id: 18,
      target_shop_id: 4,
      creator_open_id: null,
      creator_username: 'snapshot.creator',
      creator_avatar_url: 'https://example.test/snapshot-avatar.webp',
      evaluation_snapshot: {},
    },
  ];
  const { getBookings } = loadController(
    t,
    { Booking: { findAll: async () => bookingRows } },
    {},
    {},
    {
      loadCreatorProfiles: async (shopId, identities) => {
        assert.equal(shopId, 4);
        assert.deepEqual(identities, [
          { creator_open_id: 'creator-open-19', username: 'fresh.creator' },
          { creator_open_id: null, username: 'snapshot.creator' },
        ]);
        return new Map([[
          'open:creator-open-19',
          { avatar_url: 'https://example.test/fresh-avatar.webp' },
        ]]);
      },
    },
  );
  let response;

  await getBookings(
    {},
    {
      json: (value) => { response = value; },
      status: () => ({ json: () => {} }),
    },
  );

  assert.equal(response[0].creator_avatar_url, 'https://example.test/fresh-avatar.webp');
  assert.equal(response[1].creator_avatar_url, 'https://example.test/snapshot-avatar.webp');
});

test('booking list uses the requested Creator Performance period as its table reference', async (t) => {
  let performanceQuery;
  const { getBookings } = loadController(t, {
    Booking: {
      findAll: async () => [{
        id: 31,
        target_shop_id: 4,
        creator_open_id: 'creator-open-31',
        creator_username: 'period.creator',
        evaluation_snapshot: { performance: { window_type: 'PAST_180_DAYS', affiliate_gmv: '900' } },
      }],
    },
    TikTokCreatorPerformanceSnapshot: {
      findAll: async (options) => {
        performanceQuery = options;
        return [{
          toJSON: () => ({
            id: 301,
            shop_id: 4,
            creator_open_id: 'creator-open-31',
            username: 'period.creator',
            window_type: 'PAST_30_DAYS',
            affiliate_gmv: '300',
            video_views: '12000',
          }),
        }];
      },
    },
  });
  let response;

  await getBookings(
    { query: { window_type: 'PAST_30_DAYS' } },
    { json: (value) => { response = value; }, status: () => ({ json: () => {} }) },
  );

  assert.equal(performanceQuery.where.window_type, 'PAST_30_DAYS');
  assert.equal(response[0].reference_performance.window_type, 'PAST_30_DAYS');
  assert.equal(response[0].reference_performance.affiliate_gmv, '300');
  assert.equal(response[0].evaluation_snapshot.performance.window_type, 'PAST_180_DAYS');
});

test('booking list aggregates intermediate periods from completed 30-day exports', async (t) => {
  let aggregateQuery;
  const { getBookings } = loadController(t, {
    Booking: {
      findAll: async () => [{
        id: 32,
        target_shop_id: 4,
        creator_open_id: 'creator-open-32',
        creator_username: 'aggregate.creator',
        evaluation_snapshot: {},
      }],
    },
    TikTokCreatorPerformanceSnapshot: {},
    sequelize: {
      query: async (sql, options) => {
        aggregateQuery = { sql, options };
        return [{
          shop_id: 4,
          creator_open_id: 'creator-open-32',
          username: 'aggregate.creator',
          window_type: 'PAST_60_DAYS',
          affiliate_gmv: '600',
          affiliate_orders: '24',
          video_views: '18000',
          currency: 'MYR',
        }];
      },
    },
  });
  let response;

  await getBookings(
    { query: { window_type: 'PAST_60_DAYS' } },
    { json: (value) => { response = value; }, status: () => ({ json: () => {} }) },
  );

  assert.match(aggregateQuery.sql, /period\.period_rank <= :periodCount/);
  assert.equal(aggregateQuery.options.replacements.periodCount, 2);
  assert.equal(aggregateQuery.options.replacements.performanceWindow, 'PAST_60_DAYS');
  assert.equal(response[0].reference_performance.affiliate_gmv, '600');
});

test('booking custom range aggregates only non-overlapping daily exports and reports coverage', async (t) => {
  const queries = [];
  const { getBookings } = loadController(t, {
    Booking: {
      findAll: async () => [{
        id: 33,
        target_shop_id: 4,
        creator_open_id: 'creator-open-33',
        creator_username: 'daily.creator',
        evaluation_snapshot: {},
      }],
    },
    TikTokCreatorPerformanceSnapshot: {},
    sequelize: {
      query: async (sql, options) => {
        queries.push({ sql, options });
        if (/COUNT\(\*\)::integer AS available_days/.test(sql)) {
          return [{ shop_id: 4, available_days: 2 }];
        }
        return [{
          shop_id: 4,
          creator_open_id: 'creator-open-33',
          username: 'daily.creator',
          window_type: 'CUSTOM',
          affiliate_gmv: '125',
          affiliate_orders: '5',
          currency: 'MYR',
        }];
      },
    },
  });
  let response;

  await getBookings(
    { query: { window_type: 'CUSTOM', start_date: '2026-07-01', end_date: '2026-07-03' } },
    { json: (value) => { response = value; }, status: () => ({ json: () => {} }) },
  );

  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /window_type = 'PAST_24H'/);
  assert.match(queries[1].sql, /window_type = :sourceWindow/);
  assert.match(queries[1].sql, /start_date = end_date/);
  assert.equal(queries[1].options.replacements.sourceWindow, 'PAST_24H');
  assert.equal(queries[1].options.replacements.customStartDate, '2026-07-01');
  assert.equal(queries[1].options.replacements.customEndDate, '2026-07-03');
  assert.equal(response[0].reference_performance.affiliate_gmv, '125');
  assert.deepEqual(response[0].reference_performance_coverage, {
    start_date: '2026-07-01',
    end_date: '2026-07-03',
    requested_days: 3,
    available_days: 2,
    complete: false,
  });
});

test('booking custom range rejects future and overlong ranges', async (t) => {
  const { getBookings } = loadController(t, {
    Booking: { findAll: async () => [] },
  });
  const errors = [];
  const res = {
    json: () => {},
    status: (status) => ({ json: (value) => errors.push({ status, value }) }),
  };

  await getBookings({ query: { window_type: 'CUSTOM', start_date: '2099-01-01', end_date: '2099-01-02' } }, res);
  await getBookings({ query: { window_type: 'CUSTOM', start_date: '2025-01-01', end_date: '2026-01-01' } }, res);

  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map((item) => item.status), [400, 400]);
});

test('KOC search delegates filtering and pagination to the database and returns compact rows', async (t) => {
  let queryOptions;
  const { getTargetKocs } = loadController(t, {
    sequelize: {
      query: async (_sql, options) => {
        queryOptions = options;
        return [
          {
            shop_id: '1',
            creator_open_id: 'in-collab',
            username: 'shared',
            nickname: 'Shared creator',
            avatar_url: 'https://example.test/avatar.webp',
            collaboration_count: '2',
            total_count: '21',
          },
          {
            shop_id: '1',
            creator_open_id: null,
            username: 'performance_only',
            nickname: 'Performance only',
            avatar_url: null,
            collaboration_count: '0',
            total_count: '21',
          },
        ];
      },
    },
  });
  let response;

  await getTargetKocs(
    { query: { keyword: 'creator', page: '2', page_size: '2' } },
    { json: (value) => { response = value; }, status: () => ({ json: () => {} }) },
  );

  assert.deepEqual(queryOptions.replacements, {
    keyword: 'creator',
    limit: 2,
    offset: 2,
  });
  assert.deepEqual(response.pagination, {
    page: 2,
    page_size: 2,
    total: 21,
    total_pages: 11,
  });
  assert.deepEqual(response.items[0], {
    shop_id: 1,
    creator_open_id: 'in-collab',
    username: 'shared',
    nickname: 'Shared creator',
    avatar_url: 'https://example.test/avatar.webp',
    collaboration_count: 2,
  });
  assert.equal('performance' in response.items[0], false);
  assert.equal('products' in response.items[0], false);
});

test('booking video matcher auto-links a single exact creator video', async (t) => {
  let updatedPayload;
  const booking = {
    id: 21,
    creator_username: '@Creator.One',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: { recorded_at: '2026-07-20T00:00:00Z' },
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    TikTokShop: {
      findByPk: async () => ({
        id: 4,
        cipher: 'shop-cipher',
        authorization: {
          open_id: 'seller-open-id',
          granted_scopes: ['data.shop_analytics.public.read'],
        },
      }),
    },
  }, {
    getShopVideoPerformance: async () => ({
      data: {
        videos: [{
          id: '7400000000000000123',
          title: 'Creator review',
          creator: { user_name: 'creator.one' },
          video_post_time: '2026-07-22 10:30:00',
          gmv: { amount: '450.5', currency: 'MYR' },
          views: 12000,
          sku_orders: 18,
          items_sold: 20,
        }],
      },
    }),
  });
  let response;
  await matchBookingVideo(
    { params: { id: '21' }, body: {} },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(updatedPayload.video_platform_id, '7400000000000000123');
  assert.equal(updatedPayload.posted_at, '2026-07-22T10:30:00.000Z');
  assert.match(updatedPayload.video_url, /@creator\.one\/video\/7400000000000000123$/);
  assert.equal(updatedPayload.evaluation_snapshot.video_match.gmv.amount, 450.5);
  assert.equal(updatedPayload.evaluation_snapshot.video_match.orders, 18);
});

test('booking video matcher prefers the complete local Shop Video Catalog', async (t) => {
  let updatedPayload;
  let analyticsCalled = false;
  const booking = {
    id: 23,
    creator_username: 'cached.creator',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: {},
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    ShopVideoPerformanceSnapshot: {},
    ShopVideo: {
      findAll: async () => [{
        toJSON: () => ({
          platform_video_id: '7400000000000000789',
          creator_username: 'cached.creator',
          title: 'Cached creator review',
          posted_at: '2026-07-22T10:30:00.000Z',
          video_url: 'https://www.tiktok.com/@cached.creator/video/7400000000000000789',
          performance_snapshots: [{
            snapshot_date: '2026-07-24',
            gross_gmv: '900',
            currency: 'MYR',
            views: 22000,
            orders: 30,
          }],
        }),
      }],
    },
    TikTokShop: {
      findByPk: async () => ({ id: 4, authorization: { id: 1 } }),
    },
  }, {
    getShopVideoPerformance: async () => {
      analyticsCalled = true;
      throw new Error('TikTok should not be queried when the catalog has the video.');
    },
  });
  let response;
  await matchBookingVideo(
    { params: { id: '23' }, body: {} },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(analyticsCalled, false);
  assert.equal(updatedPayload.video_platform_id, '7400000000000000789');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.source, 'SHOP_VIDEO_CATALOG');
});

test('booking video matcher accepts a manually confirmed TikTok URL without calling analytics', async (t) => {
  let updatedPayload;
  const booking = {
    id: 22,
    creator_username: 'creator.two',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: {},
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    TikTokShop: { findByPk: async () => { throw new Error('Shop API should not be called'); } },
  });
  let response;
  await matchBookingVideo(
    {
      params: { id: '22' },
      body: { video_url: 'https://www.tiktok.com/@creator.two/video/7400000000000000456' },
    },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { statusCode: status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(updatedPayload.video_platform_id, '7400000000000000456');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.source, 'MANUAL_URL');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.manually_confirmed, true);
});

test('booking can be created from Creator Performance using username only', async (t) => {
  const performanceData = {
    shop_id: 3,
    creator_open_id: null,
    username: 'performance_only',
    nickname: 'Performance only',
    avatar_url: 'https://example.com/avatar.jpg',
    affiliate_gmv: '123.45',
    window_type: 'PAST_30_DAYS',
  };
  let createdPayload;
  let autoLinkedBooking;
  const performanceQueries = [];
  const { createBooking } = loadController(t, {
    User: { findByPk: async (id) => ({ id, name: 'Account manager' }) },
    TikTokTargetCollaborationSnapshot: { findOne: async () => null },
    TikTokCreatorPerformanceSnapshot: {
      findOne: async (options) => {
        performanceQueries.push(options);
        return { toJSON: () => performanceData };
      },
    },
    Booking: {
      create: async (payload) => { createdPayload = payload; return { id: 12 }; },
      findByPk: async () => ({ id: 12, ...createdPayload }),
    },
  }, {}, {
    autoLinkBookingVideos: async (booking) => {
      autoLinkedBooking = booking;
      return { status: 'matched', video_count: 2 };
    },
  });
  let statusCode;
  let response;

  await createBooking(
    {
      body: {
        target_shop_id: 3,
        target_collaboration_id: null,
        creator_open_id: null,
        creator_username: 'performance_only',
        staff_id: 7,
        booking_cost: 80,
        performance_window_type: 'PAST_30_DAYS',
        product_ids: ['product-1'],
        products: [{ id: 'product-1', name: 'Serum', imageUrl: 'https://example.com/serum.jpg' }],
      },
    },
    {
      status: (value) => {
        statusCode = value;
        return { json: (body) => { response = body; } };
      },
    },
  );

  assert.equal(statusCode, 201);
  assert.equal(response.creator_username, 'performance_only');
  assert.equal(createdPayload.target_collaboration_id, null);
  assert.equal(createdPayload.staff_id, 7);
  assert.equal(createdPayload.staff_name, 'Account manager');
  assert.equal(createdPayload.deadline, null);
  assert.equal(createdPayload.evaluation_snapshot.collaboration, null);
  assert.deepEqual(createdPayload.evaluation_snapshot.performance, performanceData);
  assert.deepEqual(createdPayload.evaluation_snapshot.product_ids, ['product-1']);
  assert.deepEqual(createdPayload.evaluation_snapshot.products, [{
    id: 'product-1',
    name: 'Serum',
    image_url: 'https://example.com/serum.jpg',
  }]);
  assert.equal(performanceQueries.length, 2);
  assert.equal(performanceQueries[1].where.window_type, 'PAST_30_DAYS');
  assert.equal(autoLinkedBooking.id, 12);
});
