const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildLiveSessions,
  fetchShopLiveSessions,
  resolveAutoHost,
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
});
