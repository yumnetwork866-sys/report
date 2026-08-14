const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateActualPerformance,
  __test: {
    affiliateCandidateFromSnapshot, exportDurationDays, matchesBookingProducts, metricOfAffiliateSnapshot,
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
  assert.equal(matchesBookingProducts({ evaluation_snapshot: {} }, {
    products: [{ id: 'any-product' }],
  }), true);
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
