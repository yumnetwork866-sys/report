const test = require('node:test');
const assert = require('node:assert/strict');
const { getHashtagRows, buildHashtagRows } = require('../src/services/booking/bookingHashtagService');
const { mockModule } = require('./helpers/mockModule');

const staff = { staff_id: 21, staff_name: 'Linh', hashtags: ['#pdl'] };
const video = {
  shop_id: 1, shop_name: 'Actiscar Malaysia', region: 'MY', creator_username: 'deemilyana',
  creator_name: 'Deemilyana', creator_avatar_url: '/avatars/deemilyana.webp',
  platform_video_id: '7696845877435960596', title: '#pdl #follicas', posted_at: '2026-10-15T10:53:05Z', views: 120,
};
const metrics = [
  { shop_id: 1, content_id: video.platform_video_id, is_total: 1, gross_gmv: 100, orders: 1, items_sold: 1, currency: 'MYR' },
  { shop_id: 1, content_id: video.platform_video_id, is_total: 0, product_id: 'follicas', product_name: 'Follicas', gross_gmv: 100, orders: 1, items_sold: 1 },
  { shop_id: 7, content_id: video.platform_video_id, is_total: 1, gross_gmv: 999, orders: 1, items_sold: 1 },
];

test('hashtag rows retain KOC avatar, cost and correctly scoped revenue without creator ownership', () => {
  const [row] = buildHashtagRows([{ ...video, ...staff }, { ...video, ...staff }], metrics,
    [{ ...video, ...staff, total_cost: 50 }], '2026-10-01');
  assert.equal(row.creator_avatar_url, video.creator_avatar_url);
  assert.equal(row.creator_name, 'Deemilyana');
  assert.equal(row.total_cost, 50);
  assert.equal(row.actual_performance.gross_gmv, 100);
  assert.equal(row.product_performance.affiliate_gmv, 100);
  assert.equal(row.booking_videos.length, 1);
  assert.equal(row.booking_videos[0].post_date, '2026-10-15');
  assert.equal(row._detail_loaded, true);
});

test('catalog hashtag mode requires active Booking roles, excludes old videos and matches regional month boundaries', async () => {
  const queries = [];
  const rows = await getHashtagRows({ month: '2026-10', staffIds: [21], shopId: 1 }, { role: 'admin' }, {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      if (queries.length === 1) return [staff];
      if (queries.length === 2) return [video,
        { ...video, platform_video_id: 'old', posted_at: '2026-09-30T15:59:59Z' },
        { ...video, platform_video_id: 'oct-midnight', posted_at: '2026-09-30T16:00:00Z' },
        { ...video, platform_video_id: 'next-month', posted_at: '2026-10-31T16:00:00Z' },
        { ...video, platform_video_id: 'wrong-tag', title: '#vh' },
      ];
      if (queries.length === 3) return metrics;
      return [];
    },
  });
  assert.deepEqual(rows[0].booking_videos.map((item) => item.platform_video_id), [video.platform_video_id, 'oct-midnight']);
  assert.equal(rows[0].creator_avatar_url, video.creator_avatar_url);
  for (const query of [queries[0], queries[3]]) {
    assert.match(query.sql, /u.is_active = true/);
    assert.match(query.sql, /u.role IN \(:bookingRoles\)/);
    assert.deepEqual(query.replacements.bookingRoles, ['member', 'koc']);
  }
  assert.match(queries[1].sql, /v.posted_at AT TIME ZONE/);
  assert.match(queries[2].sql, /pair.shop_id = s.shop_id AND pair.video_id = s.content_id/);
});

test('ordinary users cannot request another staff member in hashtag mode', async () => {
  let captured;
  await getHashtagRows({ staffIds: [14] }, { sub: 21, role: 'member', permissions: [] }, {
    query: async (_sql, options) => { captured = options.replacements; return []; },
  });
  assert.equal(captured.staffId, 21);
});

test('stale raw hashtags cannot credit #vh or #pdl videos to Junnan', async () => {
  let queryCount = 0;
  const users = [staff, { staff_id: 14, staff_name: 'Junnan', hashtags: ['#mq'] },
    { staff_id: 18, staff_name: 'Huyền', hashtags: ['#vh'] }];
  const rows = await getHashtagRows({ month: '2026-11' }, { role: 'admin' }, {
    query: async () => {
      queryCount += 1;
      if (queryCount === 1) return users;
      if (queryCount === 2) return [
        { ...video, platform_video_id: 'mq-video', title: '#mq', posted_at: '2026-11-10T00:00:00Z' },
        { ...video, platform_video_id: '7706478539129818389', title: '#ActiScarMalaysia #parut #vh', supplied_hashtags: ['mq'], posted_at: '2026-11-10T00:00:00Z' },
        { ...video, platform_video_id: 'pdl-video', title: '#pdl #ActiscarMalaysia', supplied_hashtags: ['mq'], posted_at: '2026-11-10T00:00:00Z' },
      ];
      return [];
    },
  });
  assert.deepEqual(rows.find((row) => row.staff_id === 14).booking_videos.map((item) => item.platform_video_id), ['mq-video']);
  assert.deepEqual(rows.find((row) => row.staff_id === 18).booking_videos.map((item) => item.platform_video_id), ['7706478539129818389']);
  assert.deepEqual(rows.find((row) => row.staff_id === 21).booking_videos.map((item) => item.platform_video_id), ['pdl-video']);
});

test('KOCs with costs and no current hashtag video keep their existing avatar', () => {
  const [row] = buildHashtagRows([], [], [{ ...video, ...staff, total_cost: 50,
    booked_products: [[{ id: 'follicas', name: 'Follicas' }]], booked_product_ids: [['follicas']],
  }], '2026-10-01');
  assert.equal(row.creator_avatar_url, video.creator_avatar_url);
  assert.equal(row.total_cost, 50);
  assert.equal(row.booking_videos.length, 0);
  assert.deepEqual(row.product_ids, ['follicas']);
  assert.equal(row.products[0].name, 'Follicas');
});

test('hashtag export credits order 586752324823844720 to Linh without a persisted booking', async (t) => {
  const path = require.resolve('../src/services/booking/bookingEndpointService');
  const rows = buildHashtagRows([{ ...video, ...staff }], metrics, [], '2026-10-01');
  const restores = [
    mockModule(require.resolve('../src/services/booking/bookingHashtagService'), { getHashtagRows: async () => rows }),
    mockModule(require.resolve('../src/repositories/bookingRepository'), { findBookings: async () => { throw new Error('Must use catalog'); } }),
    mockModule(require.resolve('../src/models'), { sequelize: { query: async () => [{
      shop_id: 1, video_id: video.platform_video_id, order_id: '586752324823844720',
      product_id: 'follicas', quantity: 1, price: 100, currency: 'MYR', order_raw_data: { order_status: 'COMPLETED' },
    }] } }),
  ];
  delete require.cache[path];
  t.after(() => { delete require.cache[path]; restores.reverse().forEach((restore) => restore()); });
  let result;
  await require(path).exportBookingOrders({
    body: { hashtagFilter: true, month: '2026-10', shopId: 1, staffIds: [21], videoIds: [video.platform_video_id], format: 'json' },
    query: {}, session: { role: 'admin' },
  }, { json(value) { result = value; }, setHeader() {}, status(code) { assert.equal(code, 200); return this; } });
  assert.equal(result.orders[0].orderId, '586752324823844720');
  assert.equal(result.orders[0].staffName, 'Linh');
  assert.equal(result.orders[0].gmv, 100);
  assert.equal(result.orders[0].bookingId, '');
});
