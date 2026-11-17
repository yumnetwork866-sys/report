import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Node runs the actual hook; only extensionless bundler imports are resolved here.
const hookSource = (await readFile(new URL('../src/components/booking/useBookingAnalytics.js', import.meta.url), 'utf8'))
  .replace("from 'react'", `from '${new URL('../node_modules/react/index.js', import.meta.url).href}'`)
  .replace("from '../../lib/bookingMetrics'", `from '${new URL('../src/lib/bookingMetrics.js', import.meta.url).href}'`);
const { default: useBookingAnalytics } = await import(`data:text/javascript;base64,${Buffer.from(hookSource).toString('base64')}`);

for (const bookingTab of ['video', 'product']) {
  test(`hashtag ${bookingTab} analytics preserves KOC avatar, costs and Linh revenue`, () => {
    const avatar = '/avatars/deemilyana.webp';
    const snapshot = { gross_gmv: 100, currency: 'MYR', orders: 1, items_sold: 1, views: 120 };
    const rows = [{
      id: 'hashtag:21:1:deemilyana', is_hashtag_report: true, _detail_loaded: true,
      start_date: '2026-10-01', staff_id: 21, creator_username: 'deemilyana', creator_avatar_url: avatar,
      target_shop_id: 1, target_shop: { region: 'MY' }, total_cost: 50, currency: 'MYR',
      booking_videos: [
        { platform_video_id: '7696845877435960596', hashtags: ['pdl'], post_date: '2026-10-15', latest_performance: snapshot },
        { platform_video_id: 'old-video', hashtags: ['pdl'], post_date: '2026-09-30', latest_performance: { ...snapshot, gross_gmv: 999 } },
      ],
      product_performance: { affiliate_gmv: 100, affiliate_orders: 1, currency: 'MYR', affiliate_video_ids: ['7696845877435960596'], affiliate_video_views: [{ id: '7696845877435960596', views: 120 }] },
    }];
    let analytics;
    function Harness() {
      analytics = useBookingAnalytics({
        bookings: rows, users: [{ id: 21, name: 'Linh', content_attribution: { hashtags: ['#pdl'] } }],
        canManageUsers: true, sessionUserId: '1', bookingTab, selectedMonth: '2026-10', customRange: {},
        hashtagFilterEnabled: true, productOrdersByShop: {}, selectedManagerKey: 'all', overviewSort: {}, bookingSort: {},
        collator: new Intl.Collator('vi'), convertAmount: Number, t: (key) => key,
      });
      return null;
    }
    renderToStaticMarkup(React.createElement(Harness));
    assert.equal(analytics.stats.totalRevenue, 100);
    assert.equal(analytics.stats.totalCost, 50);
    const [group] = analytics.bookingGroups;
    assert.equal(group.manager.name, 'Linh');
    assert.equal(group.bookings[0].creator_avatar_url, avatar);
    assert.equal(group.totalRevenue, 100);
    assert.equal(group.totalOrders, 1);
    assert.equal(group.videoCount, 1);
    assert.equal(group.kocCount, 1);
    assert.deepEqual(analytics.videoPerformanceByBooking.get(rows[0].id).videos.map((video) => video.platform_video_id), ['7696845877435960596']);
  });
}
