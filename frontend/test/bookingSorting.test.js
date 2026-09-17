import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingPerformanceSortValue } from '../src/lib/bookingMetrics.js';

test('reads the correct performance value for every sortable metric column', () => {
  const lower = {
    items_sold: 2,
    refunded_gmv: 10,
    samples_shipped: 1,
    estimated_commission: 5,
  };
  const higher = {
    items_sold: 20,
    refunded_gmv: 100,
    samples_shipped: 10,
    estimated_commission: 50,
  };

  for (const key of ['items_sold', 'refunds', 'samples', 'commission']) {
    assert.ok(
      bookingPerformanceSortValue(higher, key) > bookingPerformanceSortValue(lower, key),
      `${key} must compare values from two different bookings`,
    );
  }
});

// Test sorting simulation logic mirroring BookingManagement
test('sorting prioritizes period GMV over lifetime GMV when date range is selected', () => {
  const bookings = [
    {
      id: 1,
      creator_name: 'Creator High Lifetime But Zero August',
      actual_performance: { gross_gmv: 100000000, video_count: 10 },
      booking_videos: [
        { id: 101, posted_at: '2026-05-10T10:00:00Z', performance_snapshots: [{ gross_gmv: 100000000, orders: 100, items_sold: 100 }] },
      ],
    },
    {
      id: 2,
      creator_name: 'Creator Active In August',
      actual_performance: { gross_gmv: 20000000, video_count: 2 },
      booking_videos: [
        { id: 201, posted_at: '2026-08-15T14:00:00Z', performance_snapshots: [{ gross_gmv: 20000000, orders: 20, items_sold: 20 }] },
      ],
    },
  ];

  // Helper matching filterVideosByPeriod
  const filterVideos = (videos, startDate, endDate) => {
    if (!startDate && !endDate) return videos;
    return videos.filter((v) => {
      const d = String(v.posted_at || '').slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  };

  // Helper matching bookingVideoPerformanceForVideos
  const aggregateVideos = (videos) => {
    if (!videos.length) {
      return { gross_gmv: 0, orders: 0, items_sold: 0, video_count: 0 };
    }
    let gmv = 0;
    for (const v of videos) {
      gmv += v.performance_snapshots?.[0]?.gross_gmv || 0;
    }
    return { gross_gmv: gmv, video_count: videos.length };
  };

  // 1. When period is 'all':
  const allMap = new Map(bookings.map((b) => [
    b.id,
    { performance: b.actual_performance, videoCount: b.booking_videos.length },
  ]));

  const sortBookings = (list, perfMap, key = 'revenue') => {
    return [...list].sort((a, b) => {
      if (key === 'revenue') {
        const revA = perfMap.get(a.id)?.performance?.gross_gmv || 0;
        const revB = perfMap.get(b.id)?.performance?.gross_gmv || 0;
        return revB - revA;
      }
      if (key === 'videos') {
        const countA = perfMap.get(a.id)?.videoCount || 0;
        const countB = perfMap.get(b.id)?.videoCount || 0;
        return countB - countA;
      }
      return 0;
    });
  };

  const sortedAll = sortBookings(bookings, allMap, 'revenue');
  assert.equal(sortedAll[0].id, 1, 'In all-time view, Creator 1 has 100M and should be first');
  assert.equal(sortedAll[1].id, 2, 'In all-time view, Creator 2 has 20M and should be second');

  // 2. When period is '2026-08-01' to '2026-08-31':
  const augustMap = new Map(bookings.map((b) => {
    const filtered = filterVideos(b.booking_videos, '2026-08-01', '2026-08-31');
    const perf = aggregateVideos(filtered, b.actual_performance);
    return [b.id, { performance: perf, videoCount: filtered.length }];
  }));

  const sortedAugustRevenue = sortBookings(bookings, augustMap, 'revenue');
  assert.equal(sortedAugustRevenue[0].id, 2, 'In August view, Creator 2 has 20M and should be first');
  assert.equal(sortedAugustRevenue[1].id, 1, 'In August view, Creator 1 has 0M and should be second');

  const sortedAugustVideos = sortBookings(bookings, augustMap, 'videos');
  assert.equal(sortedAugustVideos[0].id, 2, 'In August view, Creator 2 has 1 video in period and should be first');
  assert.equal(sortedAugustVideos[1].id, 1, 'In August view, Creator 1 has 0 videos in period and should be second');
});
