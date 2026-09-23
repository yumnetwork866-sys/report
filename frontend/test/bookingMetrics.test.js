import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanDisplayProductName,
  resolveProductClassification,
  orderRangeForPeriod,
  isBookingInPeriod,
  bookingProductOrderPerformance,
  bookingVideoHashtags,
  bookingVideoMatchesHashtags,
  bookingVideoSocialMetrics,
  filterVideosByPeriod,
  bookingVideoPerformanceForVideos,
  countPaidBookingKocs,
  productsOfBookingVideo,
  extractProductOrderRows,
  formatOrderTimestamp,
  finiteNumber,
  optionalNumber,
  editableCurrencyAmount,
  currentBookingMonth,
  groupBookingRowsByCreator,
  mergeBookingProductBreakdowns,
} from '../src/lib/bookingMetrics.js';

test('countPaidBookingKocs only counts unique KOCs with positive cost in the selected period', () => {
  const bookings = [
    { id: 1, creator_open_id: 'creator-a', total_cost: 100 },
    { id: 2, creator_open_id: 'creator-a', total_cost: 50 },
    { id: 3, creator_username: 'free-creator', total_cost: 0 },
    { id: 4, creator_username: 'paid-creator', booking_cost: 25 },
    { id: 5, creator_username: 'outside-period', total_cost: 40 },
  ];

  const count = countPaidBookingKocs(bookings, (booking) => booking.id !== 5);

  assert.equal(count, 2);
});

test('groupBookingRowsByCreator renders one row per shop and KOC', () => {
  const bookings = [
    { id: 160, staff_id: 21, target_shop_id: 4, creator_username: 'sitimadihah91' },
    { id: 219, staff_id: 21, target_shop_id: 4, creator_username: 'SitiMadihah91' },
    { id: 220, staff_id: 21, target_shop_id: 5, creator_username: 'sitimadihah91' },
    { id: 221, staff_id: 21, target_shop_id: 4, creator_username: 'another.creator' },
  ];

  const rows = groupBookingRowsByCreator(bookings);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0]._creator_bookings.map((booking) => booking.id), [160, 219]);
  assert.deepEqual(rows[1]._creator_bookings.map((booking) => booking.id), [220]);
  assert.deepEqual(rows[2]._creator_bookings.map((booking) => booking.id), [221]);
});

test('mergeBookingProductBreakdowns keeps product counts without doubling repeated bookings', () => {
  const breakdown = mergeBookingProductBreakdowns([
    { breakdown: [{ id: 'product-a', name: 'A', orderCount: 4, quantity: 5 }] },
    { breakdown: [{ id: 'product-a', name: 'A', orderCount: 4, quantity: 5 }] },
    { breakdown: [{ id: 'product-b', name: 'B', orderCount: 3, quantity: 3 }] },
  ]);

  assert.deepEqual(breakdown, [
    { id: 'product-a', name: 'A', orderCount: 4, quantity: 5 },
    { id: 'product-b', name: 'B', orderCount: 3, quantity: 3 },
  ]);
});

test('cleanDisplayProductName removes brackets and cleans name', () => {
  assert.equal(cleanDisplayProductName('[HOT] Dầu gội Follicas - Chai 300ml'), 'Dầu gội Follicas');
  assert.equal(cleanDisplayProductName('Actiscar Serum 30ml | Trị sẹo'), 'Actiscar Serum 30ml');
  assert.equal(cleanDisplayProductName(''), '');
});

test('resolveProductClassification handles variations and default fallbacks', () => {
  assert.equal(resolveProductClassification('Chai 30ml', 'Serum Follicas'), 'Chai 30ml');
  assert.equal(resolveProductClassification('Mặc định', 'Serum Follicas (Combo 2 Chai)'), 'Serum (Combo 2 Chai)');
  assert.equal(resolveProductClassification('', ''), 'Mặc định');
  assert.equal(resolveProductClassification('default', 'Follicas'), 'Follicas');
});

test('orderRangeForPeriod formats all, custom, and monthly periods', () => {
  assert.deepEqual(orderRangeForPeriod('all'), { startTime: null, endTime: null, windowType: 'LIFETIME' });
  assert.deepEqual(orderRangeForPeriod(null), { startTime: null, endTime: null, windowType: 'LIFETIME' });

  const custom = orderRangeForPeriod('custom', { start: '2026-01-01', end: '2026-01-15' });
  assert.equal(custom.startDate, '2026-01-01');
  assert.equal(custom.endDate, '2026-01-15');
  assert.equal(custom.windowType, 'CUSTOM');

  const monthly = orderRangeForPeriod('2026-08');
  assert.equal(monthly.startDate, '2026-08-01');
  assert.equal(monthly.endDate, '2026-08-31');
  assert.equal(monthly.windowType, 'CUSTOM');
});

test('currentBookingMonth formats YYYY-MM correctly for dates', () => {
  assert.equal(currentBookingMonth(new Date('2026-09-15T12:00:00Z')), '2026-09');
  assert.equal(currentBookingMonth(new Date('2026-01-05T00:00:00Z')), '2026-01');
  assert.equal(typeof currentBookingMonth(), 'string');
  assert.match(currentBookingMonth(), /^\d{4}-\d{2}$/);
});

test('isBookingInPeriod scopes booking targets to the selected booking month', () => {
  const august = orderRangeForPeriod('2026-08');
  assert.equal(isBookingInPeriod({ start_date: '2026-08-15' }, august), true);
  assert.equal(isBookingInPeriod({ start_date: '2026-07-31' }, august), false);
  assert.equal(isBookingInPeriod({ created_at: '2026-08-20T10:00:00.000Z' }, august), true);
  assert.equal(isBookingInPeriod({ start_date: '2025-01-01' }, orderRangeForPeriod('all')), true);
});

test('bookingProductOrderPerformance calculates affiliate GMV, items sold, refunds and commission', () => {
  const booking = {
    creator_username: 'koc_test',
    currency: 'MYR',
    evaluation_snapshot: {
      product_ids: ['prod_1'],
      products: [{ id: 'prod_1', name: 'Product 1' }],
    },
  };

  const orders = [
    {
      id: 'order_1',
      create_time: 1770000000,
      skus: [
        {
          product_id: 'prod_1',
          creator_username: 'koc_test',
          quantity: 2,
          refunded_quantity: 0,
          price: { amount: 50, currency: 'MYR' },
          creator_commission_rate: 10,
        },
      ],
    },
    {
      id: 'order_2',
      create_time: 1770001000,
      skus: [
        {
          product_id: 'prod_1',
          creator_username: 'koc_test',
          quantity: 1,
          refunded_quantity: 1,
          price: { amount: 50, currency: 'MYR' },
          creator_commission_rate: 10,
        },
        {
          product_id: 'prod_other',
          creator_username: 'koc_test',
          quantity: 5,
          price: { amount: 100, currency: 'MYR' },
        },
      ],
    },
  ];

  const perf = bookingProductOrderPerformance(booking, orders);
  assert.equal(perf.affiliate_orders, 2);
  assert.equal(perf.items_sold, 3);
  assert.equal(perf.items_refunded, 1);
  assert.equal(perf.affiliate_gmv, 150);
  assert.equal(perf.refunded_gmv, 50);
  assert.equal(perf.estimated_commission, 10); // (2-0)*50*0.1 + (1-1)*50*0.1 = 10
});

test('filterVideosByPeriod filters videos by range', () => {
  const videos = [
    { id: 1, posted_at: '2026-07-31T23:59:59Z' },
    { id: 2, posted_at: '2026-08-05T12:00:00Z' },
    { id: 3, posted_at: '2026-08-31T09:00:00Z' },
    { id: 4, posted_at: '2026-09-01T00:00:00Z' },
  ];

  const filtered = filterVideosByPeriod(videos, { startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].id, 2);
  assert.equal(filtered[1].id, 3);
});

test('booking video hashtag helpers use exact normalized hashtag matches', () => {
  const video = {
    title: 'Review sản phẩm #Beauty #Da_Khoe',
    hashtags: ['SALE'],
    performance_snapshots: [],
  };

  assert.deepEqual(bookingVideoHashtags(video), ['#sale', '#beauty', '#da_khoe']);
  assert.equal(bookingVideoMatchesHashtags(video, ['#BEAUTY']), true);
  assert.equal(bookingVideoMatchesHashtags(video, ['#beaut']), false);
  assert.equal(bookingVideoMatchesHashtags(video, []), false);
});

test('bookingVideoPerformanceForVideos aggregates metrics across videos', () => {
  const videos = [
    {
      id: 1,
      performance_snapshots: [{ gross_gmv: 100, views: 500, orders: 5, items_sold: 5, currency: 'MYR' }],
    },
    {
      id: 2,
      performance_snapshots: [{ gross_gmv: 200, views: 1000, orders: 10, items_sold: 10, currency: 'MYR' }],
    },
  ];

  const perf = bookingVideoPerformanceForVideos(videos);
  assert.equal(perf.gross_gmv, 300);
  assert.equal(perf.views, 1500);
  assert.equal(perf.orders, 15);
  assert.equal(perf.items_sold, 15);
  assert.equal(perf.video_count, 2);
});

test('bookingVideoPerformanceForVideos keeps the currency of revenue-producing snapshots', () => {
  const videos = [
    { performance_snapshots: [{ gross_gmv: 297.47, orders: 2, currency: 'MYR' }] },
    { performance_snapshots: [{ gross_gmv: 153, orders: 1, currency: 'MYR' }] },
    { performance_snapshots: [{ gross_gmv: 149.6, orders: 1, currency: 'MYR' }] },
    { performance_snapshots: [{ gross_gmv: 0, orders: 0, currency: 'VND' }] },
  ];

  const performance = bookingVideoPerformanceForVideos(videos, { currency: 'VND' });

  assert.equal(performance.gross_gmv, 600.07);
  assert.equal(performance.currency, 'MYR');
});

test('bookingVideoPerformanceForVideos never falls back to commission from unfiltered videos', () => {
  const unknownCommissionVideos = [{
    id: 1,
    performance_snapshots: [{ gross_gmv: 0, orders: 0, items_sold: 0 }],
  }];
  const noOrderVideos = [{
    id: 2,
    performance_snapshots: [{ gross_gmv: 0, orders: 0, items_sold: 0, estimated_commission: 0 }],
  }];

  const unknown = bookingVideoPerformanceForVideos(unknownCommissionVideos, { estimated_commission: 999 });
  const noOrder = bookingVideoPerformanceForVideos(noOrderVideos, { estimated_commission: 999 });
  assert.equal(unknown.estimated_commission, null);
  assert.equal(noOrder.orders, 0);
  assert.equal(noOrder.estimated_commission, 0);
});

test('productsOfBookingVideo keeps per-product sold quantity from snapshot breakdown', () => {
  const snapshot = {
    items_sold: 3,
    raw_metrics: {
      detail: {
        performance: {
          intervals: [{
            sales: {
              breakdowns: [
                { product_id: 'prod_1', items_sold: 1 },
                { product_id: 'prod_2', items_sold: 2 },
              ],
            },
          }],
        },
      },
    },
  };

  const products = productsOfBookingVideo({}, snapshot);
  assert.deepEqual(products.map(({ id, quantity }) => ({ id, quantity })), [
    { id: 'prod_1', quantity: 1 },
    { id: 'prod_2', quantity: 2 },
  ]);
});

test('productsOfBookingVideo uses video total only when one product is present', () => {
  const products = productsOfBookingVideo(
    { affiliate_products: [{ id: 'prod_1' }] },
    { items_sold: 1, raw_metrics: {} },
  );
  assert.equal(products[0].quantity, 1);
});

test('extractProductOrderRows creates sorted rows with video match check', () => {
  const orders = [
    {
      id: 'ord_1',
      create_time: 1770000000,
      skus: [
        {
          product_id: 'prod_1',
          content_id: 'vid_123',
          product_name: '[FOLLICAS] Serum 30ml',
          sku_name: 'Chai 30ml',
          quantity: 2,
          price: { amount: 45, currency: 'MYR' },
          creator_username: 'koc_a',
        },
      ],
    },
  ];

  const result = extractProductOrderRows(orders, 'prod_1', 'koc_a', 'vid_123');
  assert.equal(result.totalOrders, 1);
  assert.equal(result.totalItems, 2);
  assert.equal(result.totalGmv, 90);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].isVideoMatch, true);
  assert.equal(result.rows[0].displayProductName, 'Serum 30ml');
});

test('formatOrderTimestamp formats unix and ISO timestamps correctly', () => {
  const ts = formatOrderTimestamp(1700000000);
  assert.ok(ts.date.includes('/'));
  assert.ok(ts.time.includes(':'));
  assert.deepEqual(formatOrderTimestamp(null), { date: '—', time: '' });
});

test('utility helpers handle null and number conversion', () => {
  assert.equal(finiteNumber(null), 0);
  assert.equal(finiteNumber('123.45'), 123.45);
  assert.equal(optionalNumber(''), null);
  assert.equal(optionalNumber(0), 0);
  assert.equal(editableCurrencyAmount(1234.56, 'VND'), '1235');
  assert.equal(editableCurrencyAmount(1234.56, 'MYR'), '1234.56');
});

test('booking video social metrics distinguish unavailable data from real zeroes', () => {
  const unavailable = bookingVideoSocialMetrics({
    views: 120,
    raw_metrics: { social_metrics: { available: false, likes: null, comments: null, shares: null } },
  });
  assert.equal(unavailable.views, 120);
  assert.equal(unavailable.likes, null);
  assert.equal(unavailable.comments, null);
  assert.equal(unavailable.shares, null);
  assert.equal(unavailable.available, false);

  const available = bookingVideoSocialMetrics({
    views: 120,
    raw_metrics: {
      social_metrics: {
        available: true,
        metric_window: 'PAST_30_DAYS',
        likes: 0,
        comments: 2,
        shares: 1,
        synced_at: '2026-09-17T00:00:00.000Z',
      },
    },
  });
  assert.equal(available.likes, 0);
  assert.equal(available.comments, 2);
  assert.equal(available.shares, 1);
  assert.equal(available.available, true);
});
