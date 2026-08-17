const assert = require('node:assert/strict');
const test = require('node:test');
const XLSX = require('xlsx');
const { describeIdentityChange } = require('../src/services/tiktokCreatorProfileService');

const {
  exportDateRange,
  shiftEndDay,
  parseCreatorPerformanceWorkbook,
  parseBasePerformanceWorkbook,
  enrichCreatorRows,
  loadMarketplaceCreatorProfiles,
  loadPersistedMarketplaceCooldown,
  persistMarketplaceCooldown,
  creatorRowHasFetchedProfile,
  creatorProfileNeedsRefresh,
  creatorProfileTtlExpired,
  selectCreatorProfileRefreshCandidates,
  runCreatorPerformanceProfileRefresh,
  DEFAULT_CREATOR_PROFILE_TTL_MS,
  DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
  createCreatorPerformanceExportWithFallback,
  COMPASS_COOLDOWN_NAMESPACE,
  persistCompassCooldown,
  runCompassRequest,
  configuredCompassRateLimitCooldownMs,
} = require('../src/services/tiktokCreatorPerformanceService');

test('creator profile identity logs describe name and avatar changes without exposing the URL', () => {
  const change = describeIdentityChange({
    username: 'updated.creator',
    nickname: 'New name',
    avatar_url: 'https://example.test/new-avatar.webp?signature=secret',
  }, {
    nickname: 'Old name',
    avatar_url: 'https://example.test/old-avatar.webp?signature=old-secret',
  });

  assert.deepEqual(change, {
    username: 'updated.creator',
    previousName: 'Old name',
    currentName: 'New name',
    nameChanged: true,
    avatarChanged: true,
    avatarAction: 'refreshed',
  });
  assert.equal(JSON.stringify(change).includes('signature='), false);
});

test('Compass date ranges are inclusive and match TikTok report filenames', () => {
  assert.deepEqual(exportDateRange('PAST_7_DAYS', 20260715), {
    startDate: '2026-07-09',
    endDate: '2026-07-15',
  });
  assert.deepEqual(exportDateRange('PAST_30_DAYS', 20260715), {
    startDate: '2026-06-16',
    endDate: '2026-07-15',
  });
  assert.equal(shiftEndDay(20260716, -1), 20260715);
});

test('Compass export falls back when TikTok has not made the requested day available', async () => {
  const attempts = [];
  const result = await createCreatorPerformanceExportWithFallback({ region: 'MY' }, {
    windowType: 'PAST_7_DAYS',
    endDay: 20260716,
    planType: 'ALL',
  }, {
    fallbackDelayMs: 0,
    createExport: async (_shop, options) => {
      attempts.push(options.endDay);
      if (options.endDay === 20260716) {
        const error = new Error('The day of the export is not available.');
        error.tiktokCode = 13017003;
        throw error;
      }
      return { id: 1, status: 'PROCESSING' };
    },
  });
  assert.deepEqual(attempts, [20260716, 20260715]);
  assert.equal(result.requestedEndDay, 20260716);
  assert.equal(result.endDay, 20260715);
  assert.equal(result.fallbackDays, 1);
});

test('Compass export stops immediately on rate limit instead of retrying or falling back by date', async () => {
  for (const tiktokCode of [36009037, 36009002]) {
    const attempts = [];
    await assert.rejects(createCreatorPerformanceExportWithFallback({ region: 'MY' }, {
      windowType: 'PAST_7_DAYS',
      endDay: 20260716,
      planType: 'ALL',
    }, {
      fallbackDelayMs: 0,
      createExport: async (_shop, options) => {
        attempts.push(options.endDay);
        const error = new Error('Too many requests');
        error.tiktokCode = tiktokCode;
        throw error;
      },
    }), (error) => error.tiktokCode === tiktokCode);
    assert.deepEqual(attempts, [20260716]);
  }
});

test('Compass requests persist a shop cooldown after rate limiting and block calls during it', async () => {
  const now = Date.parse('2026-08-17T03:00:00.000Z');
  let persisted;
  const rateLimitError = new Error('Too many requests');
  rateLimitError.tiktokCode = 36009037;

  await assert.rejects(runCompassRequest({ id: 7 }, async () => {
    throw rateLimitError;
  }, {
    loadCooldown: async () => 0,
    persistCooldown: async (details) => { persisted = details; },
    cooldownMs: 60 * 60 * 1000,
    now: () => now,
  }), (error) => error === rateLimitError);
  assert.equal(persisted.shopId, 7);
  assert.equal(persisted.cooldownUntil, now + 60 * 60 * 1000);

  let called = false;
  await assert.rejects(runCompassRequest({ id: 7 }, async () => {
    called = true;
  }, {
    loadCooldown: async () => persisted.cooldownUntil,
    now: () => now,
  }), (error) => error.code === 'TIKTOK_COMPASS_COOLDOWN');
  assert.equal(called, false);

  let stored;
  await persistCompassCooldown({ shopId: 7, cooldownUntil: persisted.cooldownUntil, reason: 'limited' }, {
    upsert: async (row) => { stored = row; },
  });
  assert.equal(stored.namespace, COMPASS_COOLDOWN_NAMESPACE);
});

test('Compass rate-limit cooldown escalates 15m, 30m, 1h and persists the streak', async (t) => {
  const originalBase = process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS;
  const originalMax = process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS;
  const originalLegacy = process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS;
  t.after(() => {
    if (originalBase === undefined) delete process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS;
    else process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS = originalBase;
    if (originalMax === undefined) delete process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS;
    else process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS = originalMax;
    if (originalLegacy === undefined) delete process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS;
    else process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS = originalLegacy;
  });
  process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS = String(15 * 60 * 1000);
  process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS = String(60 * 60 * 1000);
  delete process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS;

  let fakeNow = Date.parse('2026-08-17T03:00:00.000Z');
  let state = { cooldownUntil: 0, consecutiveRateLimits: 0 };
  const durations = [];
  for (const expectedMs of [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 60 * 60 * 1000]) {
    const error = new Error('Too many requests');
    error.tiktokCode = 36009037;
    await assert.rejects(runCompassRequest({ id: 7 }, async () => {
      throw error;
    }, {
      loadCooldownState: async () => state,
      persistCooldown: async (details) => {
        durations.push(details.cooldownUntil - fakeNow);
        state = {
          cooldownUntil: details.cooldownUntil,
          consecutiveRateLimits: details.consecutiveRateLimits,
        };
      },
      now: () => fakeNow,
    }), (caught) => caught === error);
    assert.equal(error.cooldownMs, expectedMs);
    fakeNow = state.cooldownUntil + 1;
  }
  assert.deepEqual(durations, [15, 30, 60, 60].map((minutes) => minutes * 60 * 1000));
  assert.equal(state.consecutiveRateLimits, 4);
  assert.equal(configuredCompassRateLimitCooldownMs(3), 60 * 60 * 1000);
});

test('Compass cooldown honors a longer Retry-After value', async () => {
  const now = Date.parse('2026-08-17T03:00:00.000Z');
  const error = new Error('Too many requests');
  error.tiktokCode = 36009037;
  error.retryAfterMs = 2 * 60 * 60 * 1000;
  let persisted;
  await assert.rejects(runCompassRequest({ id: 7 }, async () => {
    throw error;
  }, {
    loadCooldownState: async () => ({ cooldownUntil: 0, consecutiveRateLimits: 0 }),
    persistCooldown: async (details) => { persisted = details; },
    now: () => now,
  }));
  assert.equal(persisted.cooldownUntil, now + 2 * 60 * 60 * 1000);
});

test('Creator List workbook maps to Creator Performance fields', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Creator username': '',
      'Affiliate GMV': 'Metric description',
      'Affiliate orders': 'Metric description',
    },
    {
      'Creator username': '@my.belanjaharian',
      'Affiliate GMV': 'RM7,988.80',
      'Affiliate orders': '20',
      'Items sold': '20',
      'Product impressions': '5,037',
      'Affiliate refunded GMV': 'RM4,853.90',
      'Affiliate followers': '1,258',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Creator List');
  const rows = parseCreatorPerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 1,
    shopId: 1,
    startDate: '2026-07-09',
    endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS',
    planType: 'ALL',
    currency: 'MYR',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'my.belanjaharian');
  assert.equal(rows[0].affiliate_gmv, 7988.8);
  assert.equal(rows[0].affiliate_orders, 20);
  assert.equal(rows[0].items_sold, 20);
  assert.equal(rows[0].product_impressions, 5037);
  assert.equal(rows[0].refunded_gmv, 4853.9);
  assert.equal(rows[0].followers, 1258);
});

test('Compass production workbook variant with MYR formatting is parsed', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Creator name': '',
      'Creator-attributed GMV': 'Metric description',
      Refunds: 'Metric description',
    },
    {
      'Creator name': 'my.belanjaharian',
      'Creator-attributed GMV': 'RM7,988.80',
      Refunds: 'RM0.00',
      'Est. commission': 'RM399.20',
      'Attributed orders': '20',
      'Creator-attributed items sold': '20',
      'Items refunded': '12',
      Videos: '1',
      'LIVE streams': '0',
      AOV: 'RM399.44',
      'Samples shipped': '0',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet 1');
  const [row] = parseCreatorPerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 1, shopId: 1, startDate: '2026-07-09', endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS', planType: 'ALL', currency: 'MYR',
  });
  assert.equal(row.affiliate_gmv, 7988.8);
  assert.equal(row.affiliate_orders, 20);
  assert.equal(row.items_sold, 20);
  assert.equal(row.refunded_gmv, 0);
  assert.equal(row.average_order_value, 399.44);
});

test('Compass creator workbook maps every metric shown in the performance table', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([{
    'Creator name': '@full.creator',
    'Creator-attributed GMV': 'RM1,200.50',
    'Creator LIVE-attributed GMV': 'RM300.25',
    'Creator video-attributed GMV': 'RM400.75',
    Refunds: 'RM25.50',
    'Attributed orders': '15',
    'Creator-attributed items sold': '18',
    'Items refunded': '2',
    AOV: 'RM80.03',
    'Affiliate product card-attributed GMV': 'RM499.50',
    CTOR: '12.5%',
    'LIVE streams': '3',
    Videos: '4',
    'Total sample content': '5',
    'Samples shipped': '6',
    'Products added to showcase': '7',
    CTR: '8.5%',
    'Product impressions': '1,000',
    'Video views': '2,000',
    Customers: '9',
    'Products sold': '18',
    'Est. commission': 'RM60.25',
  }]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Creator List');
  const [row] = parseCreatorPerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 3,
    shopId: 1,
    startDate: '2026-07-15',
    endDate: '2026-07-21',
    windowType: 'PAST_7_DAYS',
    planType: 'ALL',
    currency: 'MYR',
  });

  assert.equal(row.username, 'full.creator');
  assert.equal(row.affiliate_gmv, 1200.5);
  assert.equal(row.live_gmv, 300.25);
  assert.equal(row.video_gmv, 400.75);
  assert.equal(row.refunded_gmv, 25.5);
  assert.equal(row.affiliate_orders, 15);
  assert.equal(row.items_sold, 18);
  assert.equal(row.items_refunded, 2);
  assert.equal(row.average_order_value, 80.03);
  assert.equal(row.product_card_gmv, 499.5);
  assert.equal(row.ctor, 0.125);
  assert.equal(row.live_streams, 3);
  assert.equal(row.shoppable_videos, 4);
  assert.equal(row.total_sample_content, 5);
  assert.equal(row.samples_shipped, 6);
  assert.equal(row.products_added_to_showcase, 7);
  assert.equal(row.ctr, 0.085);
  assert.equal(row.product_impressions, 1000);
  assert.equal(row.video_views, 2000);
  assert.equal(row.customers, 9);
  assert.equal(row.products_sold, 18);
  assert.equal(row.estimated_commission, 60.25);
});

test('complete creator profiles are refreshed after the 24-hour TTL', () => {
  const now = Date.parse('2026-07-22T04:00:00.000Z');
  const completeRow = {
    username: 'stale.creator',
    avatar_url: 'https://example.test/avatar.webp',
    followers: 100,
  };
  const freshProfile = {
    username: 'stale.creator',
    refreshed_at: new Date(now - DEFAULT_CREATOR_PROFILE_TTL_MS + 1),
  };
  const staleProfile = {
    username: 'stale.creator',
    refreshed_at: new Date(now - DEFAULT_CREATOR_PROFILE_TTL_MS),
  };

  assert.equal(creatorProfileTtlExpired(freshProfile, { now }), false);
  assert.equal(creatorProfileTtlExpired(staleProfile, { now }), true);
  assert.deepEqual(selectCreatorProfileRefreshCandidates(
    [completeRow],
    new Map([['username:stale.creator', staleProfile]]),
    { now },
  ), [completeRow]);
  assert.deepEqual(selectCreatorProfileRefreshCandidates(
    [completeRow],
    new Map([['username:stale.creator', freshProfile]]),
    { now },
  ), []);
});

test('a fresh creator profile with an avatar is not refreshed just because followers are zero', () => {
  const now = Date.parse('2026-07-22T07:30:00.000Z');
  const row = {
    username: '111_wafia',
    avatar_url: 'https://example.test/avatar.webp',
    followers: 0,
  };
  const profile = {
    username: '111_wafia',
    avatar_url: 'https://example.test/avatar.webp',
    follower_count: 0,
    refreshed_at: new Date(now - 60 * 60 * 1000),
  };

  assert.equal(creatorProfileNeedsRefresh(row), false);
  assert.deepEqual(selectCreatorProfileRefreshCandidates(
    [row],
    new Map([['username:111_wafia', profile]]),
    { now },
  ), []);
});

test('Creator Performance refresh requests one creator at a time with a two-minute gap', async () => {
  const searches = [];
  const waits = [];
  const persisted = [];
  const snapshotUpdates = [];
  const rows = [
    { username: 'first.creator', nickname: 'First', avatar_url: 'https://old.test/first.webp', followers: 10 },
    { username: 'second.creator', nickname: 'Second', avatar_url: 'https://old.test/second.webp', followers: 20 },
  ];
  const SnapshotModel = {
    async findAll() {
      return rows.map((row) => ({ toJSON: () => ({
        ...row,
        shop_id: 7,
        start_date: '2026-07-16',
        end_date: '2026-07-22',
        plan_type: 'ALL',
      }) }));
    },
    async bulkCreate(profileRows) { snapshotUpdates.push(profileRows); },
  };
  const count = await runCreatorPerformanceProfileRefresh({
    id: 7,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, {
    id: 12,
    task_id: 'task-12',
    start_date: '2026-07-16',
    end_date: '2026-07-22',
    plan_type: 'ALL',
  }, {
    SnapshotModel,
    loadStoredProfiles: async () => new Map(),
    saveProfiles: async (_shopId, profileRows) => persisted.push(profileRows.map((row) => row.username)),
    hydrateProfiles: async (_shopId, profileRows) => profileRows,
    searchMarketplace: async ({ keyword }) => {
      searches.push(keyword);
      return { data: { creators: [{
        username: keyword,
        nickname: `${keyword} updated`,
        avatar_url: `https://new.test/${keyword}.webp`,
      }] } };
    },
    marketplaceOptions: {
      retryCount: 0,
      requestGate: async (_shopId, operation) => operation(),
    },
    requestIntervalMs: DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    logger: { info() {}, warn() {} },
  });

  assert.equal(count, 2);
  assert.deepEqual(searches, ['first.creator', 'second.creator']);
  assert.deepEqual(waits, [DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS]);
  assert.deepEqual(persisted, [['first.creator'], ['second.creator']]);
  assert.equal(snapshotUpdates.length, 2);
});

test('Creator Performance retries the same creator after two minutes when TikTok rate-limits it', async () => {
  let fakeNow = Date.parse('2026-07-22T04:00:00.000Z');
  let searchCalls = 0;
  const waits = [];
  const persisted = [];
  const cooldowns = new Map();
  const shopCooldowns = new Map();
  const wait = async (milliseconds) => {
    waits.push(milliseconds);
    fakeNow += milliseconds;
  };
  const SnapshotModel = {
    async findAll() {
      return [{ toJSON: () => ({
        username: 'retry.creator',
        avatar_url: null,
        followers: 0,
        shop_id: 7,
        start_date: '2026-07-16',
        end_date: '2026-07-22',
        plan_type: 'ALL',
      }) }];
    },
    async bulkCreate() {},
  };

  const count = await runCreatorPerformanceProfileRefresh({
    id: 7,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, {
    id: 13,
    task_id: 'task-13',
    start_date: '2026-07-16',
    end_date: '2026-07-22',
    plan_type: 'ALL',
  }, {
    SnapshotModel,
    loadStoredProfiles: async () => new Map(),
    saveProfiles: async (_shopId, profileRows) => persisted.push(profileRows[0].username),
    hydrateProfiles: async (_shopId, profileRows) => profileRows,
    searchMarketplace: async ({ keyword }) => {
      searchCalls += 1;
      if (searchCalls === 1) {
        const error = new Error('Too many requests for downstream.');
        error.tiktokCode = 36009002;
        throw error;
      }
      return { data: { creators: [{
        username: keyword,
        nickname: 'Retry Creator',
        avatar_url: 'https://new.test/retry.creator.webp',
      }] } };
    },
    marketplaceOptions: {
      retryCount: 0,
      cooldowns,
      shopCooldowns,
      now: () => fakeNow,
      sleep: wait,
      requestGate: async (_shopId, operation) => operation(),
    },
    now: () => fakeNow,
    sleep: wait,
    logger: { info() {}, warn() {} },
  });

  assert.equal(count, 1);
  assert.equal(searchCalls, 2);
  assert.deepEqual(waits, [DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS]);
  assert.deepEqual(persisted, ['retry.creator']);
});

test('report rows without a fetched identity do not advance the profile refresh timestamp', () => {
  assert.equal(creatorRowHasFetchedProfile({
    username: 'metrics.only',
    followers: 1234,
    nickname: null,
    avatar_url: null,
    creator_open_id: null,
  }), false);
  assert.equal(creatorRowHasFetchedProfile({
    username: 'profile.fetched',
    followers: 1234,
    nickname: 'Profile Fetched',
  }), true);
});

test('Compass BASE workbook skips the description row and maps core metrics', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Creator-attributed GMV', 'Creator-attributed items sold', 'Refunds', 'Est. commission', 'Videos', 'LIVE streams', 'Samples shipped', 'Items refunded', 'AOV'],
    ['Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description'],
    ['RM18,139.74', '80', 'RM0.00', 'RM699.03', '30', '1', '9', '23', 'RM232.56'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet 1');
  const row = parseBasePerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 2,
    shopId: 1,
    startDate: '2026-07-09',
    endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS',
    currency: 'MYR',
  });
  assert.equal(row.creator_attributed_gmv, 18139.74);
  assert.equal(row.creator_attributed_items_sold, 80);
  assert.equal(row.estimated_commission, 699.03);
  assert.equal(row.videos, 30);
  assert.equal(row.live_streams, 1);
  assert.equal(row.samples_shipped, 9);
  assert.equal(row.items_refunded, 23);
  assert.equal(row.average_order_value, 232.56);
});

test('creator rows use Sample Applications first and Marketplace as avatar fallback', async () => {
  const rows = [
    { username: 'sample.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 },
    { username: 'market.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 },
  ];
  const marketplaceKeywords = [];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: {
      granted_scopes: [
        'seller.affiliate_collaboration.read',
        'seller.creator_marketplace.read',
      ],
    },
  }, rows, {
    searchSamples: async () => ({
      data: {
        sample_applications: [{
          creator: {
            username: 'sample.creator',
            nickname: 'Sample Creator',
            avatar_url: 'https://example.test/sample.webp',
            follower_count: 120,
            user_id: 'sample-user-id',
          },
        }],
      },
    }),
    searchMarketplace: async ({ keyword }) => {
      marketplaceKeywords.push(keyword);
      return {
        data: {
          creators: [{
            username: keyword,
            nickname: 'Market Creator',
            avatar: { url: 'https://example.test/market.webp' },
            follower_count: 340,
            creator_open_id: 'market-open-id',
          }],
        },
      };
    },
  });

  assert.deepEqual(marketplaceKeywords, ['market.creator']);
  assert.deepEqual(rows[0], {
    username: 'sample.creator',
    nickname: 'Sample Creator',
    avatar_url: 'https://example.test/sample.webp',
    creator_open_id: 'sample-user-id',
    followers: 120,
  });
  assert.deepEqual(rows[1], {
    username: 'market.creator',
    nickname: 'Market Creator',
    avatar_url: 'https://example.test/market.webp',
    creator_open_id: 'market-open-id',
    followers: 340,
  });
});

test('creator Marketplace fallback is skipped when OAuth scope is not granted', async () => {
  let marketplaceCalls = 0;
  const rows = [{ username: 'missing.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 }];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  }, rows, {
    searchSamples: async () => ({ data: { sample_applications: [] } }),
    searchMarketplace: async () => {
      marketplaceCalls += 1;
      return { data: { creators: [] } };
    },
  });
  assert.equal(marketplaceCalls, 0);
  assert.equal(rows[0].avatar_url, null);
});

test('creator Marketplace fallback does not request an avatar-complete creator just to fill followers', async () => {
  const rows = [{
    username: 'avatar.only',
    nickname: 'Avatar Only',
    avatar_url: 'https://example.test/existing.webp',
    creator_open_id: null,
    followers: 0,
  }];
  const marketplaceKeywords = [];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, rows, {
    searchSamples: async () => ({ data: { sample_applications: [] } }),
    searchMarketplace: async ({ keyword }) => {
      marketplaceKeywords.push(keyword);
      return {
        data: {
          creators: [{
            username: keyword,
            nickname: 'Avatar Only',
            avatar: { url: 'https://example.test/current.webp' },
            follower_count: 9876,
            creator_open_id: 'avatar-only-open-id',
          }],
        },
      };
    },
    marketplaceOptions: { minIntervalMs: 0 },
  });

  assert.deepEqual(marketplaceKeywords, []);
  assert.equal(rows[0].followers, 0);
  assert.equal(rows[0].creator_open_id, null);
});

test('Marketplace creator lookup cools down downstream rate limits', async () => {
  let calls = 0;
  const cooldowns = new Map();
  const shopCooldowns = new Map();
  const now = () => 1000;
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['retry.creator'], async () => {
    calls += 1;
    const error = new Error('Too many requests for downstream.');
    error.tiktokCode = 36009002;
    throw error;
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    retryCount: 2,
    rateLimitCooldownMs: 60000,
    cooldowns,
    shopCooldowns,
    now,
    sleep: async () => {},
  });

  assert.equal(calls, 1);
  assert.equal(profiles.size, 0);
  assert.equal(cooldowns.get('1:retry.creator'), 61000);
  assert.equal(shopCooldowns.get('1'), 61000);
});

test('Marketplace creator profile lookup uses the shared per-shop request gate', async () => {
  const gatedShopIds = [];
  let marketplaceCalls = 0;
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 7,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['gated.creator'], async ({ keyword }) => {
    marketplaceCalls += 1;
    return { data: { creators: [{ username: keyword, nickname: 'Gated Creator' }] } };
  }, {
    minIntervalMs: 0,
    retryCount: 0,
    requestGate: async (shopId, operation) => {
      gatedShopIds.push(shopId);
      return operation();
    },
  });

  assert.deepEqual(gatedShopIds, [7]);
  assert.equal(marketplaceCalls, 1);
  assert.equal(profiles.get('gated.creator').nickname, 'Gated Creator');
});

test('Marketplace creator lookup still retries transient transport failures', async () => {
  let calls = 0;
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['retry.creator'], async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('socket timeout');
    }
    return {
      data: {
        creators: [{
          username: 'retry.creator',
          nickname: 'Retry Creator',
          avatar: { url: 'https://example.test/retry.webp' },
          creator_open_id: 'retry-open-id',
        }],
      },
    };
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    retryCount: 2,
    sleep: async () => {},
  });

  assert.equal(calls, 2);
  assert.equal(profiles.get('retry.creator').avatar_url, 'https://example.test/retry.webp');
});

test('Marketplace creator lookup skips the whole shop during cooldown', async () => {
  let calls = 0;
  const cooldowns = new Map();
  const shopCooldowns = new Map([['1', 2000]]);
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['one.creator', 'two.creator'], async () => {
    calls += 1;
    return { data: { creators: [] } };
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    cooldowns,
    shopCooldowns,
    now: () => 1000,
    sleep: async () => {},
  });

  assert.equal(calls, 0);
  assert.equal(profiles.size, 0);
});

test('Marketplace cooldown survives process memory through the persistent store', async () => {
  let stored;
  const model = {
    async upsert(value) { stored = value; },
    async findOne() { return stored; },
  };
  const cooldownUntil = Date.now() + 60_000;

  await persistMarketplaceCooldown({
    shopId: 7,
    cooldownUntil,
    reason: 'Too many requests for downstream.',
  }, model);

  assert.equal(await loadPersistedMarketplaceCooldown(7, model), cooldownUntil);
  assert.equal(stored.shop_id, 7);
  assert.equal(stored.namespace, 'creator_marketplace_profile');
});

test('legacy 30-minute Creator Performance cooldown is capped at two minutes', async () => {
  const updatedAt = new Date('2026-07-22T04:00:00.000Z');
  const model = {
    async findOne() {
      return {
        cooldown_until: new Date(updatedAt.getTime() + 30 * 60_000),
        updated_at: updatedAt,
      };
    },
  };

  assert.equal(
    await loadPersistedMarketplaceCooldown(7, model),
    updatedAt.getTime() + DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
  );
});
