const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/services/tiktokVideoPerformanceService');

test('TikTok Analytics list and detail responses are normalized into a video snapshot', () => {
  const row = __test.apiVideoRow({
    exportId: 7,
    shopId: 3,
    syncedAt: new Date('2026-08-05T01:00:00.000Z'),
    video: {
      id: '7616717880972856597',
      title: 'Demo video',
      username: 'demo.creator',
      creator: { user_name: 'demo.creator', nick_name: 'Demo Creator' },
      video_post_time: '2026-08-01 12:00:00',
      gmv: { amount: '120', currency: 'MYR' },
      gpm: { amount: '20', currency: 'MYR' },
      avg_customers: 2,
      sku_orders: 3,
      items_sold: 4,
      views: 1000,
      click_through_rate: '0.15',
      products: [{ id: 'product-1' }],
    },
    detail: {
      data: {
        performance: {
          intervals: [{
            sales: {
              overall: {
                gmv: { amount: '180', currency: 'MYR' },
                customers: 6,
                items_sold: 7,
                product_impressions: 800,
                product_clicks: 150,
              },
              breakdowns: [{ product_id: 'product-1' }, { product_id: 'product-2' }],
            },
            traffic: { views: 1000, likes: 30, comments: 5, shares: 2 },
          }],
        },
      },
    },
  });

  assert.equal(row.video_title, 'Demo video');
  assert.equal(row.video_id, '7616717880972856597');
  assert.equal(row.video_link, 'https://www.tiktok.com/@demo.creator/video/7616717880972856597');
  assert.equal(row.creator_name, 'Demo Creator');
  assert.equal(row.product_id, 'product-1, product-2');
  assert.equal(row.creator_attributed_gmv, 180);
  assert.equal(row.attributed_orders, 6);
  assert.equal(row.aov, 30);
  assert.equal(row.attributed_items_sold, 7);
  assert.equal(row.refunds, 0);
  assert.equal(row.items_refunded, 0);
  assert.equal(row.likes, 30);
  assert.equal(row.comments, 5);
  assert.equal(row.shares, 2);
  assert.equal(row.product_impressions, 800);
  assert.equal(row.product_clicks, 150);
  assert.equal(row.ctr, 150 / 800);
  assert.equal(row.raw_metrics.source, 'TIKTOK_SHOP_ANALYTICS_API');
});

test('video detail mapper respects its concurrency limit and keeps result order', async () => {
  let active = 0;
  let maximumActive = 0;
  const values = await __test.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(values, [10, 20, 30, 40, 50]);
  assert.equal(maximumActive, 2);
});

test('mapWithConcurrency respects pacing delay between items', async () => {
  const start = Date.now();
  await __test.mapWithConcurrency([1, 2, 3], 1, async (v) => v * 2, 20);
  const duration = Date.now() - start;
  assert.ok(duration >= 35, `Duration was ${duration}ms, expected >= 35ms`);
});

test('apiVideoRow gracefully falls back to list metrics when detail request fails', () => {
  const row = __test.apiVideoRow({
    exportId: 10,
    shopId: 7,
    video: {
      id: '7681915692634967314',
      title: 'Fallback list video',
      username: 'follicas.creator',
      video_post_time: '2026-09-05 13:16:16',
      gmv: { amount: '250', currency: 'MYR' },
      views: 5400,
      orders: 12,
      items_sold: 15,
    },
    detail: null,
    detailError: new Error('Rate limit 36009002'),
  });

  assert.equal(row.video_id, '7681915692634967314');
  assert.equal(row.video_title, 'Fallback list video');
  assert.equal(row.creator_attributed_gmv, 250);
  assert.equal(row.video_views, 5400);
  assert.equal(row.attributed_orders, 12);
  assert.equal(row.attributed_items_sold, 15);
  assert.equal(row.raw_metrics.detail, null);
  assert.equal(row.raw_metrics.detail_error, 'Rate limit 36009002');
});

test('video detail delay defaults to 150ms and respects environment override', () => {
  assert.equal(__test.DEFAULT_VIDEO_DETAIL_DELAY_MS, 150);
  const original = process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS;
  try {
    delete process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS;
    assert.equal(__test.configuredVideoDetailDelayMs(), 150);
    process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS = '200';
    assert.equal(__test.configuredVideoDetailDelayMs(), 200);
  } finally {
    if (original === undefined) {
      delete process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS;
    } else {
      process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS = original;
    }
  }
});

test('selectVideosForDetailFetch returns empty set when TIKTOK_VIDEO_DETAIL_ENABLED is false', () => {
  const originalEnabled = process.env.TIKTOK_VIDEO_DETAIL_ENABLED;
  try {
    process.env.TIKTOK_VIDEO_DETAIL_ENABLED = 'false';
    const videos = [{ id: '1', gmv: { amount: '100' }, sku_orders: 5, views: 100 }];
    const selected = __test.selectVideosForDetailFetch(videos);
    assert.equal(selected.size, 0);
  } finally {
    if (originalEnabled === undefined) delete process.env.TIKTOK_VIDEO_DETAIL_ENABLED;
    else process.env.TIKTOK_VIDEO_DETAIL_ENABLED = originalEnabled;
  }
});

test('selectVideosForDetailFetch prioritizes videos with GMV, orders, and top activity', () => {
  const originalEnabled = process.env.TIKTOK_VIDEO_DETAIL_ENABLED;
  const originalTop = process.env.TIKTOK_VIDEO_DETAIL_TOP_LIMIT;
  const originalMax = process.env.TIKTOK_VIDEO_DETAIL_MAX_FETCH;
  try {
    process.env.TIKTOK_VIDEO_DETAIL_ENABLED = 'true';
    process.env.TIKTOK_VIDEO_DETAIL_TOP_LIMIT = '2';
    process.env.TIKTOK_VIDEO_DETAIL_MAX_FETCH = '5';

    const videos = [
      { id: '1', gmv: { amount: '0' }, sku_orders: 0, views: 10 },
      { id: '2', gmv: { amount: '0' }, sku_orders: 0, views: 20 },
      { id: '3', gmv: { amount: '0' }, sku_orders: 0, views: 5 },
      { id: '4', gmv: { amount: '150' }, sku_orders: 0, views: 10 }, // has GMV
      { id: '5', gmv: { amount: '0' }, sku_orders: 3, views: 10 },   // has orders
      { id: '6', gmv: { amount: '0' }, sku_orders: 0, views: 1000 }, // high views
      { id: '7', gmv: { amount: '0' }, sku_orders: 0, views: 0 },    // inactive
    ];

    const selected = __test.selectVideosForDetailFetch(videos);

    // 1 and 2 are top 2 by rank
    assert.ok(selected.has('1'), 'Top 1 by rank should be included');
    assert.ok(selected.has('2'), 'Top 2 by rank should be included');
    // 4 has GMV
    assert.ok(selected.has('4'), 'Video with GMV should be included');
    // 5 has orders
    assert.ok(selected.has('5'), 'Video with orders should be included');
    // 6 is top by views
    assert.ok(selected.has('6'), 'Video with highest views should be included');
    // 7 is inactive and not top
    assert.equal(selected.has('7'), false, 'Inactive video should not be selected');
  } finally {
    if (originalEnabled === undefined) delete process.env.TIKTOK_VIDEO_DETAIL_ENABLED;
    else process.env.TIKTOK_VIDEO_DETAIL_ENABLED = originalEnabled;
    if (originalTop === undefined) delete process.env.TIKTOK_VIDEO_DETAIL_TOP_LIMIT;
    else process.env.TIKTOK_VIDEO_DETAIL_TOP_LIMIT = originalTop;
    if (originalMax === undefined) delete process.env.TIKTOK_VIDEO_DETAIL_MAX_FETCH;
    else process.env.TIKTOK_VIDEO_DETAIL_MAX_FETCH = originalMax;
  }
});

test('apiVideoRow works cleanly without detail for inactive videos', () => {
  const row = __test.apiVideoRow({
    exportId: 10,
    shopId: 7,
    video: {
      id: '7681915692634967315',
      title: 'Zero activity video',
      username: 'sample.creator',
      video_post_time: '2026-09-01 10:00:00',
      gmv: { amount: '0', currency: 'MYR' },
      views: 12,
      sku_orders: 0,
      items_sold: 0,
    },
    detail: null,
  });

  assert.equal(row.video_id, '7681915692634967315');
  assert.equal(row.video_title, 'Zero activity video');
  assert.equal(row.creator_attributed_gmv, 0);
  assert.equal(row.video_views, 12);
  assert.equal(row.attributed_orders, 0);
  assert.equal(row.raw_metrics.detail, null);
  assert.equal(row.raw_metrics.detail_error, undefined);
});

test('mapWithConcurrency aborts immediately when AbortSignal is triggered', async () => {
  const controller = new AbortController();
  let processed = 0;
  await assert.rejects(async () => {
    await __test.mapWithConcurrency([1, 2, 3, 4, 5], 1, async (v) => {
      processed += 1;
      if (processed === 2) controller.abort();
      return v * 10;
    }, 0, controller.signal);
  }, (err) => {
    assert.equal(err.name, 'AbortError');
    return true;
  });
  assert.equal(processed, 2, 'Should not process remaining items after abort');
});


