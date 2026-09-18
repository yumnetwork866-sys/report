import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboardKey,
  buildVideoKey,
  clearDashboardMemoryCache,
  getCachedDashboard,
  getCachedVideos,
  setCachedDashboard,
  setCachedVideos,
} from '../src/lib/dashboardCache.js';

test('dashboard cache builds consistent keys', () => {
  assert.equal(
    buildDashboardKey({ channelId: '5', userId: 'all', startDate: '2026-08-01', endDate: '2026-08-31', metric: 'date' }),
    '5|all|2026-08-01|2026-08-31|date|gmv',
  );
  assert.equal(
    buildDashboardKey({}),
    'all|all|none|none|date|gmv',
  );

  assert.equal(
    buildVideoKey({ channelId: '5', page: 2, pageSize: 20 }),
    '5|all|none|none|none||published_at|desc|2|20',
  );
  assert.equal(
    buildVideoKey({ channelId: '5', date: '2026-08-15', page: 1, pageSize: 20 }),
    '5|all|none|none|2026-08-15||published_at|desc|1|20',
  );
});

test('dashboard cache stores and retrieves data within TTL', () => {
  clearDashboardMemoryCache();
  const params = { channelId: '1', startDate: '2026-08-01', endDate: '2026-08-31' };
  const mockData = { totals: { views: 50000, gross_gmv: 1200 }, chart: [] };

  assert.equal(getCachedDashboard(params), null);

  setCachedDashboard(params, mockData);
  assert.deepEqual(getCachedDashboard(params), mockData);

  // Expired entry check
  assert.equal(getCachedDashboard(params, -1), null);
});

test('video cache stores and retrieves paginated videos independently', () => {
  clearDashboardMemoryCache();
  const page1Params = { channelId: '1', page: 1, pageSize: 20 };
  const page2Params = { channelId: '1', page: 2, pageSize: 20 };

  setCachedVideos(page1Params, { videos: [{ id: 1 }, { id: 2 }] });
  setCachedVideos(page2Params, { videos: [{ id: 3 }, { id: 4 }] });

  assert.deepEqual(getCachedVideos(page1Params), { videos: [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(getCachedVideos(page2Params), { videos: [{ id: 3 }, { id: 4 }] });

  clearDashboardMemoryCache();
  assert.equal(getCachedVideos(page1Params), null);
  assert.equal(getCachedVideos(page2Params), null);
});
