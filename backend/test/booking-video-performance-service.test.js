const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateActualPerformance,
  __test: {
    affiliateCandidateFromSnapshot, exportDurationDays, matchesBookingDateRange, matchesBookingProducts, metricOfAffiliateSnapshot,
    normalizeCachedVideoCandidate, productIdsOfVideo,
    resolveOrderMetricsForVideo,
  },
} = require('../src/services/bookingVideoPerformanceService');

test('booking maps the 30-day Affiliate Video snapshot metrics', () => {
  assert.equal(exportDurationDays({ start_date: '2026-07-06', end_date: '2026-08-05' }), 30);
  assert.equal(exportDurationDays({ start_date: '2026-07-29', end_date: '2026-08-05' }), 7);
  const result = metricOfAffiliateSnapshot({
    export_id: 73,
    creator_attributed_gmv: '1734.58',
    attributed_orders: 8,
    attributed_items_sold: 8,
    video_views: 12000,
    ctr: '0.1234',
    product_impressions: 654,
    product_clicks: 52,
    product_id: '998877',
    raw_metrics: { list: { gmv: { currency: 'MYR' } } },
  });
  assert.equal(result.gross_gmv, 1734.58);
  assert.equal(result.orders, 8);
  assert.equal(result.items_sold, 8);
  assert.equal(result.views, 12000);
  assert.equal(result.ctr, 52 / 654);
  assert.equal(result.currency, 'MYR');
  assert.equal(result.raw_metrics.source, 'AFFILIATE_VIDEO_PERFORMANCE');
  assert.equal(result.raw_metrics.product_id, '998877');
});

test('Affiliate Video snapshot becomes a booking video candidate', () => {
  const candidate = affiliateCandidateFromSnapshot({
    video_id: '7668576967792397589',
    video_title: 'Actiscar video',
    post_date: '2026-07-31 14:35:18',
    video_link: 'https://www.tiktok.com/@drhanafee/video/7668576967792397589',
    creator_attributed_gmv: '125.50',
    attributed_orders: 2,
    attributed_items_sold: 3,
    video_views: 1404,
    product_impressions: 654,
    product_clicks: 52,
    product_id: '998877',
    raw_metrics: { list: { creator: { user_name: 'drhanafee' }, gmv: { currency: 'MYR' }, products: [{ id: '998877', title: 'Actiscar' }] } },
  });
  assert.equal(candidate.id, '7668576967792397589');
  assert.equal(candidate.username, 'drhanafee');
  assert.equal(candidate.gmv.amount, 125.5);
  assert.equal(candidate.posted_at, '2026-07-31T14:35:18.000Z');
  assert.equal(candidate.product_id, '998877');
  assert.equal(candidate.ctr, 52 / 654);
  assert.equal(candidate.products[0].title, 'Actiscar');
});

test('booking video must contain at least one product selected by the user', () => {
  const booking = {
    evaluation_snapshot: {
      products: [{ id: 'selected-product' }],
      product_ids: ['selected-product'],
    },
  };
  assert.equal(matchesBookingProducts(booking, {
    product_id: 'other-product',
    products: [{ id: 'selected-product' }],
  }), true);
  assert.equal(matchesBookingProducts(booking, {
    product_id: 'other-product',
    products: [{ id: 'another-product' }],
  }), false);
  assert.equal(matchesBookingProducts(booking, {
    product_id: null,
    products: [],
  }), false);
  assert.equal(matchesBookingProducts({ evaluation_snapshot: {} }, {
    products: [],
  }), false);
});

test('booking video must match booking start_date and end_date range', () => {
  const booking = {
    start_date: '2026-09-01',
    end_date: '2026-09-15',
  };
  assert.equal(matchesBookingDateRange(booking, { posted_at: '2026-09-05T12:00:00.000Z' }), true);
  assert.equal(matchesBookingDateRange(booking, { posted_at: '2026-08-31T23:59:59.000Z' }), false);
  assert.equal(matchesBookingDateRange(booking, { posted_at: '2026-09-16T00:00:01.000Z' }), false);

  const legacyBooking = {
    deadline: '2026-09-10',
  };
  assert.equal(matchesBookingDateRange(legacyBooking, { posted_at: '2026-09-10T10:00:00.000Z' }), true);
  assert.equal(matchesBookingDateRange(legacyBooking, { posted_at: '2026-09-11T00:00:00.000Z' }), false);
});

test('booking performance only counts the selected product breakdown', () => {
  const snapshot = {
    creator_attributed_gmv: '500',
    attributed_orders: 9,
    attributed_items_sold: 10,
    video_views: 2000,
    product_impressions: 1000,
    product_clicks: 100,
    raw_metrics: {
      detail: { performance: { intervals: [{ sales: {
        overall: { gmv: { amount: '500', currency: 'MYR' } },
        breakdowns: [
          { product_id: 'selected', gmv: { amount: '125', currency: 'MYR' }, items_sold: 3, sku_orders: 2, product_impressions: 250, product_clicks: 25 },
          { product_id: 'other', gmv: { amount: '375', currency: 'MYR' }, items_sold: 7, sku_orders: 7, product_impressions: 750, product_clicks: 75 },
        ],
      } }] } },
      list: { products: [{ id: 'selected' }, { id: 'other' }] },
    },
  };
  const result = metricOfAffiliateSnapshot(snapshot, new Set(['selected']));
  assert.equal(result.gross_gmv, 125);
  assert.equal(result.orders, 2);
  assert.equal(result.items_sold, 3);
  assert.equal(result.ctr, 0.1);
  assert.equal(result.raw_metrics.metric_scope, 'SELECTED_BOOKING_PRODUCTS');
  assert.deepEqual(result.raw_metrics.selected_product_ids, ['selected']);
});

test('actual booking performance uses latest snapshot and does not invent Net GMV', () => {
  const result = calculateActualPerformance({
    booking_cost: 1500,
    booking_videos: [{
      status: 'COLLECTING',
      performance_snapshots: [
        { snapshot_date: '2026-07-22', gross_gmv: '4500', refunded_gmv: null, orders: 20, views: 12000, currency: 'MYR' },
        { snapshot_date: '2026-07-23', gross_gmv: '6000', refunded_gmv: null, orders: 28, views: 18000, currency: 'MYR' },
      ],
    }],
  });

  assert.equal(result.gross_gmv, 6000);
  assert.equal(result.gross_roas, 4);
  assert.equal(result.orders, 28);
  assert.equal(result.net_gmv, null);
  assert.equal(result.net_roas, null);
  assert.equal(result.roi, null);
  assert.equal(result.roi_status, 'MISSING_COST_DATA');
});

test('actual booking performance calculates Net ROAS only with complete refund data', () => {
  const result = calculateActualPerformance({
    booking_cost: 1000,
    booking_videos: [
      {
        status: 'FINALIZED',
        performance_snapshots: [{ snapshot_date: '2026-07-23', gross_gmv: '4000', refunded_gmv: '500', orders: 12 }],
      },
      {
        status: 'FINALIZED',
        performance_snapshots: [{ snapshot_date: '2026-07-23', gross_gmv: '2000', refunded_gmv: '100', orders: 8 }],
      },
    ],
  });

  assert.equal(result.gross_gmv, 6000);
  assert.equal(result.refunded_gmv, 600);
  assert.equal(result.net_gmv, 5400);
  assert.equal(result.gross_roas, 6);
  assert.equal(result.net_roas, 5.4);
  assert.equal(result.status, 'FINALIZED');
});

test('resolveOrderMetricsForVideo aggregates order ledger data by selected products', () => {
  const videoData = {
    shop_id: 1,
    video_id: '7123456789',
    by_product: new Map([
      ['prod-1', { product_id: 'prod-1', currency: 'VND', orders: 5, items_sold: 8, refunded_quantity: 1, gross_gmv: 500000, refunded_gmv: 50000, net_gmv: 450000 }],
      ['prod-2', { product_id: 'prod-2', currency: 'VND', orders: 3, items_sold: 4, refunded_quantity: 0, gross_gmv: 300000, refunded_gmv: 0, net_gmv: 300000 }],
    ]),
    products: ['prod-1', 'prod-2'],
  };

  // 1. Scoped to prod-1
  const scopedProd1 = resolveOrderMetricsForVideo(videoData, new Set(['prod-1']));
  assert.equal(scopedProd1.has_data, true);
  assert.equal(scopedProd1.gross_gmv, 500000);
  assert.equal(scopedProd1.refunded_gmv, 50000);
  assert.equal(scopedProd1.net_gmv, 450000);
  assert.equal(scopedProd1.orders, 5);
  assert.equal(scopedProd1.items_sold, 8);
  assert.deepEqual(scopedProd1.product_ids, ['prod-1']);

  // 2. Scoped to an unassociated product
  const scopedUnmatched = resolveOrderMetricsForVideo(videoData, new Set(['prod-999']));
  assert.equal(scopedUnmatched.has_data, false);
  assert.equal(scopedUnmatched.gross_gmv, 0);
  assert.equal(scopedUnmatched.orders, 0);

  // 3. All products (no filter)
  const allProducts = resolveOrderMetricsForVideo(videoData, new Set());
  assert.equal(allProducts.has_data, true);
  assert.equal(allProducts.gross_gmv, 800000);
  assert.equal(allProducts.refunded_gmv, 50000);
  assert.equal(allProducts.net_gmv, 750000);
  assert.equal(allProducts.orders, 8);
  assert.equal(allProducts.items_sold, 12);
});

test('metricOfAffiliateSnapshot uses order ledger metrics when video detail is omitted', () => {
  const snapshotWithoutDetail = {
    export_id: 101,
    creator_attributed_gmv: '800000',
    attributed_orders: 8,
    attributed_items_sold: 12,
    video_views: 5000,
    product_impressions: 0,
    product_clicks: 0,
    product_id: 'prod-1, prod-2',
    raw_metrics: {
      source: 'TIKTOK_SHOP_ANALYTICS_API',
      list: {
        id: '7123456789',
        products: [{ id: 'prod-1' }, { id: 'prod-2' }],
        gmv: { amount: '800000', currency: 'VND' },
      },
      detail: null,
    },
  };

  const orderMetrics = {
    has_data: true,
    gross_gmv: 500000,
    refunded_gmv: 50000,
    net_gmv: 450000,
    orders: 5,
    items_sold: 8,
    currency: 'VND',
    product_ids: ['prod-1'],
  };

  const result = metricOfAffiliateSnapshot(snapshotWithoutDetail, new Set(['prod-1']), orderMetrics);
  assert.equal(result.gross_gmv, 500000);
  assert.equal(result.refunded_gmv, 50000);
  assert.equal(result.net_gmv, 450000);
  assert.equal(result.orders, 5);
  assert.equal(result.items_sold, 8);
  assert.equal(result.views, 5000);
  assert.equal(result.currency, 'VND');
  assert.equal(result.raw_metrics.order_ledger_used, true);
  assert.equal(result.raw_metrics.product_metrics_available, true);
});

test('productIdsOfVideo extracts product IDs from raw_data and order_metrics', () => {
  const video = {
    raw_data: {
      products: [{ id: 'prod-catalog-1' }, { id: 'prod-catalog-2' }],
    },
    order_metrics: {
      product_ids: ['prod-order-1'],
    },
  };
  const ids = productIdsOfVideo(video);
  assert.equal(ids.has('prod-catalog-1'), true);
  assert.equal(ids.has('prod-catalog-2'), true);
  assert.equal(ids.has('prod-order-1'), true);
  assert.equal(ids.has('prod-nonexistent'), false);
});

test('normalizeCachedVideoCandidate merges order ledger metrics into catalog candidate', () => {
  const shopVideo = {
    platform_video_id: '7999888777',
    title: 'Review serum',
    creator_username: '@koc.beauty',
    posted_at: '2026-09-02T10:00:00.000Z',
    video_url: 'https://www.tiktok.com/@koc.beauty/video/7999888777',
    raw_data: {
      products: [{ id: 'prod-serum', title: 'Serum Tri Nam' }],
    },
    performance_snapshots: [
      {
        snapshot_date: '2026-09-03',
        views: 25000,
        gross_gmv: 0,
        orders: 0,
        ctr: 0.05,
        currency: 'VND',
      },
    ],
  };

  const orderMetrics = {
    has_data: true,
    gross_gmv: 1500000,
    refunded_gmv: 150000,
    net_gmv: 1350000,
    orders: 10,
    items_sold: 12,
    currency: 'VND',
    product_ids: ['prod-serum'],
  };

  const candidate = normalizeCachedVideoCandidate(shopVideo, orderMetrics);
  assert.equal(candidate.id, '7999888777');
  assert.equal(candidate.username, 'koc.beauty');
  assert.equal(candidate.gmv.amount, 1500000);
  assert.equal(candidate.refunded_gmv, 150000);
  assert.equal(candidate.net_gmv, 1350000);
  assert.equal(candidate.orders, 10);
  assert.equal(candidate.items_sold, 12);
  assert.equal(candidate.views, 25000);
  assert.equal(candidate.cached_catalog, true);
  assert.equal(candidate.products[0].id, 'prod-serum');
});

