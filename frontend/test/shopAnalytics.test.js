import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creatorForVideo,
  formatVideoPostDate,
  productsForVideo,
  scopesOf,
  totalsFor,
} from '../src/components/shop-analytics/shopAnalyticsUtils.js';

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
