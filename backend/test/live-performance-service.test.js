const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildLiveSessions,
  fetchShopLiveSessions,
  loadPersistedLiveSessions,
  loadShopLivePerformance,
  resolveAutoHost,
  saveLiveSessionPerformances,
  toEpochMs,
} = require('../src/services/livePerformanceService');

const fakeDb = (hosts) => ({
  query: async () => hosts,
});

test('buildLiveSessions resolves the unique host matching a title hashtag', async () => {
  const db = fakeDb([
    {
      id: 7,
      name: 'Host An',
      email: 'an@example.test',
      avatar_url: 'https://cdn.example.test/an.png',
      hashtags: ['#HostAn', 'sale'],
    },
    {
      id: 8,
      name: 'Host Binh',
      email: 'binh@example.test',
      avatar_url: null,
      hashtags: ['#hostbinh'],
    },
  ]);
  const lives = await buildLiveSessions([{
    id: '7600000000000000001',
    title: 'Chốt đơn cùng #hostan hôm nay',
    creator: { user_name: 'creator.an', nick_name: 'Creator An' },
    start_time: '1700000000',
    end_time: 1700003600,
  }], { db });

  assert.equal(lives.length, 1);
  assert.equal(lives[0].live_id, '7600000000000000001');
  assert.equal(lives[0].creator_username, 'creator.an');
  assert.equal(lives[0].creator_nickname, 'Creator An');
  assert.equal(lives[0].title, 'Chốt đơn cùng #hostan hôm nay');
  assert.deepEqual(lives[0].hashtags, ['hostan']);
  assert.equal(lives[0].start_time, 1700000000000);
  assert.equal(lives[0].end_time, 1700003600000);
  assert.equal(lives[0].auto_host.id, 7);
  assert.equal(lives[0].auto_host.name, 'Host An');
  assert.equal(lives[0].auto_host.email, 'an@example.test');
});

test('buildLiveSessions leaves the host empty when hashtags match more than one user', async () => {
  const db = fakeDb([
    { id: 7, name: 'Host An', hashtags: ['#hostan'] },
    { id: 8, name: 'Host Binh', hashtags: ['hostan'] },
  ]);
  const lives = await buildLiveSessions([{
    id: 'live-1',
    title: 'Live #hostan',
    start_time: 1700000000,
  }], { db });

  assert.equal(lives[0].auto_host, null);
});

test('buildLiveSessions skips sessions without an id and supports suffix hashtag matching', async () => {
  const db = fakeDb([
    { id: 7, name: 'Host An', hashtags: ['#vh'] },
  ]);
  const lives = await buildLiveSessions([
    { id: '', title: 'Live #vh' },
    { id: 'live-2', title: 'Live #parutvh', start_time: 1700000000 },
  ], { db });

  assert.equal(lives.length, 1);
  assert.equal(lives[0].live_id, 'live-2');
  assert.equal(lives[0].auto_host.id, 7);
});

test('resolveAutoHost ignores empty titles and empty host lists', () => {
  assert.equal(resolveAutoHost('', [{ user: { id: 1 }, hashtags: ['sale'] }]), null);
  assert.equal(resolveAutoHost('Live #sale', []), null);
  assert.equal(toEpochMs('not-a-number'), null);
  assert.equal(toEpochMs(null), null);
  assert.equal(toEpochMs(''), null);
  assert.equal(toEpochMs('0'), null);
  assert.equal(toEpochMs('1700000000'), 1700000000000);
  assert.equal(toEpochMs('2026-11-03 14:00:00'), Date.parse('2026-11-03 14:00:00'));
});

test('fetchShopLiveSessions queries all account types, paginates, and deduplicates sessions', async () => {
  const calls = [];
  const sessions = await fetchShopLiveSessions({
    shop: { authorization: { id: 1 }, cipher: 'cipher-1' },
    startDate: '2026-07-01',
    endDate: '2026-07-08',
    currency: 'LOCAL',
    performanceLoader: async ({ accountType, pageToken, pageSize, currency, startDate, endDate }) => {
      calls.push({ accountType, pageToken, pageSize, currency, startDate, endDate });
      if (accountType === 'OFFICIAL_ACCOUNTS' && !pageToken) {
        return {
          data: {
            next_page_token: 'official-page-2',
            live_stream_sessions: [{ id: 'live-1', title: 'Official', interaction_performance: { comments: 5 } }],
          },
        };
      }
      if (accountType === 'OFFICIAL_ACCOUNTS') {
        return {
          data: {
            live_stream_sessions: [{ id: 'live-2', title: 'Official 2' }],
          },
        };
      }
      if (accountType === 'AFFILIATE_ACCOUNTS') {
        return {
          data: {
            live_stream_sessions: [
              { id: 'live-1', title: 'Affiliate title' },
              { id: 'live-3', title: 'Affiliate' },
            ],
          },
        };
      }
      return { data: { live_stream_sessions: [] } };
    },
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.accountType).sort(), [
    'AFFILIATE_ACCOUNTS',
    'MARKETING_ACCOUNTS',
    'OFFICIAL_ACCOUNTS',
    'OFFICIAL_ACCOUNTS',
  ]);
  assert.ok(calls.every((call) => call.pageSize === 100));
  assert.ok(calls.every((call) => call.currency === 'LOCAL'));
  assert.ok(calls.every((call) => call.startDate === '2026-07-01' && call.endDate === '2026-07-08'));
  assert.equal(sessions.length, 3);
  assert.equal(sessions.find((session) => session.id === 'live-1').title, 'Official');
  assert.equal(sessions.find((session) => session.id === 'live-1').interaction_performance?.comments, 5);
});

test('buildLiveSessions extracts total_comments and author_type from creator or direct fields', async () => {
  const db = fakeDb([]);
  const lives = await buildLiveSessions([
    {
      id: 'live-comment-1',
      title: 'Live with interaction',
      creator: { user_name: 'shop.official', nick_name: 'Official Shop', author_type: 'OFFICIAL' },
      interaction_performance: { comments: 534, comment_rate: '0.0047' },
    },
    {
      id: 'live-comment-2',
      title: 'Live with total_comments',
      creator: { user_name: 'creator.koc', author_type: 'AFFILIATE' },
      total_comments: 89,
    },
    {
      id: 'live-comment-3',
      title: 'Live without comments',
    },
  ], { db });

  assert.equal(lives[0].total_comments, 534);
  assert.equal(lives[0].author_type, 'OFFICIAL');
  assert.equal(lives[0].interaction_performance?.comments, 534);
  assert.equal(lives[1].total_comments, 89);
  assert.equal(lives[1].author_type, 'AFFILIATE');
  assert.equal(lives[2].total_comments, null);
  assert.equal(lives[2].author_type, null);
});

test('buildLiveSessions extracts duration and synthesizes end_time when missing', async () => {
  const db = fakeDb([]);
  const lives = await buildLiveSessions([
    {
      id: 'live-dur-1',
      title: 'Live with duration',
      start_time: '1700000000',
      duration: 3600,
    },
    {
      id: 'live-dur-2',
      title: 'Live with traffic duration',
      start_time: '1700000000',
      traffic: { duration: 7200 },
    },
    {
      id: 'live-dur-3',
      title: 'Live with start and end',
      start_time: '1700000000',
      end_time: '1700001800',
    },
  ], { db });

  assert.equal(lives[0].duration, 3600);
  assert.equal(lives[0].end_time, 1700000000000 + 3600000);
  assert.equal(lives[1].duration, 7200);
  assert.equal(lives[1].end_time, 1700000000000 + 7200000);
  assert.equal(lives[2].duration, 1800);
  assert.equal(lives[2].end_time, 1700001800000);
});

test('loadPersistedLiveSessions returns empty array when shopId or db query missing', async () => {
  const result = await loadPersistedLiveSessions(null);
  assert.deepEqual(result, []);
});

test('saveLiveSessionPerformances inserts or updates rows in the database', async () => {
  const executed = [];
  const mockDb = {
    query: async (sql, options) => {
      executed.push({ sql, replacements: options?.replacements });
      return [];
    },
  };

  const count = await saveLiveSessionPerformances(1, [
    {
      live_id: 'live-100',
      title: 'Mega Live Sale',
      creator_username: 'koc_user',
      creator_nickname: 'KOC User',
      author_type: 'AFFILIATE',
      start_time: 1700000000000,
      end_time: 1700007200000,
      duration_seconds: 7200,
      total_comments: 150,
      hashtags: ['mega', 'sale'],
      interaction_performance: { comments: 150 },
    },
  ], { db: mockDb });

  assert.equal(count, 1);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].replacements.shopId, 1);
  assert.equal(executed[0].replacements.sessionId, 'live-100');
  assert.equal(executed[0].replacements.title, 'Mega Live Sale');
  assert.equal(executed[0].replacements.durationSeconds, 7200);
});

test('loadShopLivePerformance falls back to database when API call fails', async () => {
  const mockDb = {
    query: async (sql) => {
      if (/FROM live_session_performances/i.test(sql)) {
        return [
          {
            shop_id: 1,
            session_id: 'live-saved-1',
            title: 'Saved Live From DB',
            creator_username: 'creator.saved',
            creator_nickname: 'Saved Creator',
            author_type: 'OFFICIAL',
            start_time: 1700000000000,
            end_time: 1700003600000,
            duration_seconds: 3600,
            total_comments: 50,
            hashtags: ['saved'],
            interaction_performance: null,
            raw_data: {},
          },
        ];
      }
      return [];
    },
  };

  const result = await loadShopLivePerformance({
    shop: { id: 1, authorization: { id: 1 }, cipher: 'test' },
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    currency: 'LOCAL',
    db: mockDb,
    performanceLoader: async () => {
      throw new Error('TikTok API Rate Limit Exceeded (429)');
    },
  });

  assert.equal(result.lives.length, 1);
  assert.equal(result.lives[0].live_id, 'live-saved-1');
  assert.equal(result.lives[0].title, 'Saved Live From DB');
  assert.equal(result.lives[0].duration, 3600);
});

test('loadShopLivePerformance merges API lives and DB lives without losing historical sessions', async () => {
  const mockDb = {
    query: async (sql) => {
      if (/FROM live_session_performances/i.test(sql)) {
        return [
          {
            shop_id: 1,
            session_id: 'live-old',
            title: 'Old Live In DB',
            duration_seconds: 5400,
            start_time: 1700000000000,
          },
        ];
      }
      return [];
    },
  };

  const result = await loadShopLivePerformance({
    shop: { id: 1, authorization: { id: 1 }, cipher: 'test' },
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    currency: 'LOCAL',
    db: mockDb,
    performanceLoader: async () => ({
      data: {
        live_stream_sessions: [
          {
            id: 'live-new',
            title: 'New Live From API',
            duration: 3600,
            start_time: 1700050000,
          },
        ],
      },
    }),
  });

  assert.equal(result.lives.length, 2);
  const oldLive = result.lives.find((l) => l.live_id === 'live-old');
  const newLive = result.lives.find((l) => l.live_id === 'live-new');
  assert.ok(oldLive);
  assert.equal(oldLive.duration, 5400);
  assert.ok(newLive);
  assert.equal(newLive.duration, 3600);
});

test('buildLiveSessions extracts sales_performance and attributed metrics correctly', async () => {
  const db = fakeDb([]);
  const lives = await buildLiveSessions([
    {
      id: 'live-attributed-1',
      title: 'Session With Attributed Sales',
      start_time: '1700000000',
      sales_performance: {
        live_attributed_gmv: { amount: '303.00', currency: 'MYR' },
        sku_orders: 2,
        items_sold: 2,
      },
    },
    {
      id: 'live-attributed-2',
      title: 'Session With Direct GMV Number',
      start_time: '1700000000',
      live_attributed_gmv: 399,
      orders: 2,
      items_sold: 2,
    },
  ], { db });

  assert.equal(lives.length, 2);
  assert.equal(lives[0].attributed_gmv, 303);
  assert.equal(lives[0].sales_currency, 'MYR');
  assert.equal(lives[0].attributed_orders, 2);
  assert.equal(lives[0].attributed_items_sold, 2);

  assert.equal(lives[1].attributed_gmv, 399);
  assert.equal(lives[1].attributed_orders, 2);
  assert.equal(lives[1].attributed_items_sold, 2);
});
