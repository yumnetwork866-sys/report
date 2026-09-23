import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineShopAnalyticsSnapshots,
  creatorForVideo,
  formatVideoPostDate,
  percentageChange,
  productsForVideo,
  rangeForDays,
  shiftDate,
  scopesOf,
  totalsFor,
} from '../src/components/shop-analytics/shopAnalyticsUtils.js';
import { canLoadShopAnalytics } from '../src/components/shop-analytics/hooks/useShopAnalyticsData.js';
import {
  canLoadShopVideos,
  creatorOptionsForVideos,
  filterVideoRows,
  videoRequestOptions,
  videoTotalsFor,
} from '../src/components/shop-analytics/hooks/useShopVideoAnalytics.js';

test('totalsFor preserves financial and cancellation semantics', () => {
  assert.deepEqual(totalsFor([
    {
      gmv: { amount: '125.5' },
      orders: '2',
      units_sold: 3,
      buyers: 2,
      product_impressions: 100,
      product_page_views: 25,
      refunds: { amount: '5.5' },
      cancellations_and_returns: 1,
    },
    {
      gmv: 74.5,
      orders: 2,
      units_sold: 2,
      buyers: 1,
      product_impressions: 50,
      product_page_views: 10,
      refunds: 0,
      cancellations_and_returns: null,
    },
  ]), {
    gmv: 200,
    orders: 4,
    unitsSold: 5,
    buyers: 3,
    impressions: 150,
    pageViews: 35,
    refunds: 5.5,
    cancellations: 1,
    avgOrderValue: 50,
  });
});

test('combineShopAnalyticsSnapshots aggregates shops by day in one currency', () => {
  const snapshot = combineShopAnalyticsSnapshots([
    {
      synced_at: '2026-09-22T01:00:00Z',
      latest_available_date: '2026-09-21',
      metrics: {
        intervals: [{
          start_date: '2026-09-21', end_date: '2026-09-22',
          gmv: { amount: '100', currency: 'USD' }, refunds: { amount: '5', currency: 'USD' },
          orders: 2, units_sold: 3, buyers: 2, product_impressions: 50, product_page_views: 20,
          cancellations_and_returns: 1,
          gmv_breakdowns: [{ type: 'VIDEO', amount: '70', currency: 'USD' }],
        }],
        comparison_intervals: [],
      },
    },
    {
      synced_at: '2026-09-22T02:00:00Z',
      latest_available_date: '2026-09-21',
      metrics: {
        intervals: [{
          start_date: '2026-09-21', end_date: '2026-09-22',
          gmv: { amount: '60', currency: 'USD' }, refunds: 0,
          orders: 1, units_sold: 1, buyers: 1, product_impressions: 25, product_page_views: 10,
          cancellations_and_returns: null,
          gmv_breakdowns: [{ type: 'VIDEO', amount: '30', currency: 'USD' }],
        }],
        comparison_intervals: [],
      },
    },
  ], 'USD');

  assert.equal(snapshot.shop_count, 2);
  assert.equal(snapshot.synced_at, '2026-09-22T02:00:00Z');
  assert.deepEqual(snapshot.metrics.intervals[0], {
    start_date: '2026-09-21',
    end_date: '2026-09-22',
    gmv: { amount: 160, currency: 'USD' },
    refunds: { amount: 5, currency: 'USD' },
    cancellations_and_returns: 1,
    gmv_breakdowns: [{ type: 'VIDEO', amount: 100, currency: 'USD' }],
    orders: 3,
    units_sold: 4,
    buyers: 3,
    product_impressions: 75,
    product_page_views: 30,
  });
});

test('productsForVideo merges embedded products with catalog metadata', () => {
  assert.deepEqual(productsForVideo({
    product_id: 'p1,p2',
    raw_metrics: { list: { products: [{ id: 'p1', name: 'Embedded' }] } },
  }, {
    p2: { title: 'Catalog', thumbnail_url: 'https://example.com/p2.jpg' },
  }), [
    { id: 'p1', name: 'Embedded', thumbnailUrl: null },
    { id: 'p2', name: 'Catalog', thumbnailUrl: 'https://example.com/p2.jpg' },
  ]);
});

test('creator and scope normalization remain stable', () => {
  assert.deepEqual(creatorForVideo({
    creator_username: '@Sample.Creator',
    creator_name: 'Sample',
    creator_avatar_url: 'avatar.jpg',
  }), {
    key: 'username:sample.creator',
    label: 'Sample (@Sample.Creator)',
    name: 'Sample',
    username: 'Sample.Creator',
    avatarUrl: 'avatar.jpg',
  });
  assert.deepEqual(scopesOf({ granted_scopes: 'read, write ,,' }), ['read', 'write']);
});

test('formatVideoPostDate formats an ISO-like timestamp without timezone drift', () => {
  assert.equal(formatVideoPostDate('2026-09-21T13:04:05Z'), '21/09/2026 13:04:05');
  assert.equal(formatVideoPostDate('not-a-date', 'N/A'), 'N/A');
});

test('date range helpers preserve the exclusive end-date contract', () => {
  const range = rangeForDays(7);
  assert.equal(shiftDate(range.startDate, 7), range.endDate);
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01');
  assert.equal(shiftDate('invalid', 1), '');
});

test('video creator filtering and multi-term search are deterministic', () => {
  const rows = [
    {
      video_id: 'v1',
      video_title: 'Summer blue shirt',
      creator_username: 'alice',
      creator_name: 'Alice',
      gmv: 120,
      video_views: 50,
      orders: 2,
    },
    {
      video_id: 'v2',
      video_title: 'Red shoes',
      creator_username: 'bob',
      creator_name: 'Bob',
      gmv: 80,
      video_views: 25,
      orders: 1,
    },
  ];
  const options = creatorOptionsForVideos(rows, 'en-US');
  assert.deepEqual(options.map((option) => option.value), ['username:alice', 'username:bob']);
  assert.deepEqual(filterVideoRows({
    creatorKey: 'username:alice', locale: 'en-US', rows,
    search: 'blue alice', videoExportOnly: true,
  }).map((row) => row.video_id), ['v1']);
  assert.deepEqual(videoTotalsFor(rows), { gmv: 200, views: 75, orders: 3, itemsSold: 0 });
});

test('video sorting request keeps the selected server-side sort contract', () => {
  const options = videoRequestOptions({
    accountType: 'AFFILIATE_ACCOUNTS',
    currency: 'LOCAL',
    endDate: '2026-09-22',
    signal: 'signal',
    sortField: 'views',
    startDate: '2026-09-15',
  });
  assert.equal(options.sortField, 'views');
  assert.equal(options.sortOrder, 'DESC');
  assert.equal(options.pageSize, 100);
});

test('KPI comparison handles increases, decreases and missing comparison data', () => {
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(80, 100), -20);
  assert.equal(percentageChange(10, 0), null);
  assert.equal(percentageChange(10, 5, false), null);
});

test('data hooks are guarded when scope, date range or selection is invalid', () => {
  assert.equal(canLoadShopAnalytics({
    invalidRange: true, managementOnly: false, missingAnalyticsScope: false,
    selectedShopId: '1', tokenExpired: false, videoOnly: false,
  }), false);
  assert.equal(canLoadShopAnalytics({
    invalidRange: false, managementOnly: false, missingAnalyticsScope: true,
    selectedShopId: '1', tokenExpired: false, videoOnly: false,
  }), false);
  assert.equal(canLoadShopAnalytics({
    invalidRange: false, managementOnly: false, missingAnalyticsScope: false,
    selectedShopId: '1', tokenExpired: false, videoOnly: false,
  }), true);
  assert.equal(canLoadShopVideos({
    invalidRange: false,
    managementOnly: false,
    missingAnalyticsScope: true,
    selectedShopId: '1',
    tokenExpired: false,
    videoOnly: true,
  }), false);
  assert.equal(canLoadShopVideos({
    invalidRange: false,
    managementOnly: false,
    missingAnalyticsScope: false,
    selectedShopId: '1',
    tokenExpired: false,
    videoOnly: true,
  }), true);
});
