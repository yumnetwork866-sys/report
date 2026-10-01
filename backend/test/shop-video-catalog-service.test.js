const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('shop video catalog follows every TikTok page and stores daily snapshots', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const shopServicePath = require.resolve('../src/services/tiktokShopService');
  const fixturesPath = require.resolve('../src/lib/tiktokDemoFixtures');
  const servicePath = require.resolve('../src/services/shopVideoCatalogService');
  let apiCalls = 0;
  let catalogRows = 0;
  let snapshotRows = 0;
  const requestedAccountTypes = [];
  const requestedRanges = [];
  const storedAccountTypes = [];
  const restores = [
    mockModule(modelsPath, {
      ShopVideo: {
        bulkCreate: async (rows) => {
          catalogRows += rows.length;
          storedAccountTypes.push(...rows.map((row) => row.account_type));
        },
        findAll: async ({ where }) => where.platform_video_id[Object.getOwnPropertySymbols(where.platform_video_id)[0]]
          .map((platformVideoId, index) => ({ id: index + 1, platform_video_id: platformVideoId })),
      },
      ShopVideoPerformanceSnapshot: {
        bulkCreate: async (rows) => { snapshotRows += rows.length; },
      },
    }),
    mockModule(shopServicePath, {
      getShopVideoPerformance: async ({ accountType, pageToken, startDate, endDate }) => {
        apiCalls += 1;
        requestedAccountTypes.push(accountType);
        requestedRanges.push({ startDate, endDate });
        const page = Number(pageToken || 0);
        return {
          data: {
            videos: [0, 1].map(() => ({
              id: `${accountType}-video-${page}`,
              creator: { user_name: 'creator' },
              video_post_time: '2026-07-23 10:00:00',
              gmv: { amount: String(100 + page), currency: 'MYR' },
              views: 1000 + page,
            })),
            next_page_token: page < 2 ? String(page + 1) : null,
          },
        };
      },
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

  const { syncShopVideoCatalog } = require(servicePath);
  const result = await syncShopVideoCatalog({
    id: 1,
    cipher: 'cipher',
    authorization: { id: 2 },
  }, { now: new Date('2026-07-24T06:00:00.000Z') });

  assert.equal(apiCalls, 9);
  assert.equal(catalogRows, 9);
  assert.equal(snapshotRows, 9);
  assert.equal(result.pages, 9);
  assert.equal(result.total, 9);
  assert.deepEqual([...new Set(requestedAccountTypes)], [
    'OFFICIAL_ACCOUNTS',
    'MARKETING_ACCOUNTS',
    'AFFILIATE_ACCOUNTS',
  ]);
  assert.deepEqual([...new Set(storedAccountTypes)], [
    'OFFICIAL_ACCOUNTS',
    'MARKETING_ACCOUNTS',
    'AFFILIATE_ACCOUNTS',
  ]);
  assert.deepEqual([...new Set(requestedRanges.map(({ startDate, endDate }) => `${startDate}:${endDate}`))], [
    '2026-05-26:2026-07-25',
  ]);
  assert.deepEqual(result.account_types, {
    OFFICIAL_ACCOUNTS: { total: 3, pages: 3 },
    MARKETING_ACCOUNTS: { total: 3, pages: 3 },
    AFFILIATE_ACCOUNTS: { total: 3, pages: 3 },
  });
  assert.equal(result.snapshot_date, '2026-07-24');
});
