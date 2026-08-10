import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchBookingTargetKocDetail, fetchBookings, fetchChannelReport, fetchChannelReportMemberDetail, fetchTikTokSellerMarketplaceCreator, fetchTikTokSellerMarketplaceCreators, fetchTikTokShopAnalytics, fetchTikTokShopVideoAnalytics, fetchTikTokShopVideoPerformance, fetchTikTokShopVideoThumbnail, fetchUsers, startTikTokPartnerOauth, startTikTokShopOauth, syncChannelVideos, syncTikTokShopAnalytics, syncTikTokShopVideoPerformance,
} from '../src/lib/api.js';
import { getStoredSession, saveStoredSession } from '../src/lib/session.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createSession(id) {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Date.now() + 60_000,
  })).toString('base64url');
  return { token: `${payload}.${id}`, user: { id } };
}

async function withBrowser(callback) {
  const descriptors = new Map(
    ['window', 'localStorage', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const browserWindow = new EventTarget();
  browserWindow.setTimeout = (handler, delay) => setTimeout(handler, delay);
  browserWindow.clearTimeout = (timeoutId) => clearTimeout(timeoutId);

  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: createStorage() });

  try {
    await callback();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('a delayed 401 from an old request does not remove the new login', async () => {
  await withBrowser(async () => {
    const oldSession = createSession('old');
    const newSession = createSession('new');
    let resolveFetch;
    globalThis.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

    saveStoredSession(oldSession);
    const request = fetchUsers();
    saveStoredSession(newSession);
    resolveFetch(errorResponse(401, 'Session expired'));

    await assert.rejects(request, /Session expired/);
    assert.equal(getStoredSession()?.token, newSession.token);
  });
});

test('a current admin 401 clears the session while a platform 428 does not', async () => {
  await withBrowser(async () => {
    const session = createSession('current');
    saveStoredSession(session);
    globalThis.fetch = async () => errorResponse(428, 'TikTok authorization is required');

    await assert.rejects(syncChannelVideos(1), /TikTok authorization is required/);
    assert.equal(getStoredSession()?.token, session.token);

    globalThis.fetch = async () => errorResponse(401, 'Session expired');
    await assert.rejects(fetchUsers(), /Session expired/);
    assert.equal(getStoredSession(), null);
  });
});

test('TikTok Shop API helpers preserve analytics filters, sync payload and abort signal', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('shop-admin'));
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ authorizeUrl: 'https://services.example.test/authorize', snapshots: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await startTikTokShopOauth();
    await fetchTikTokShopAnalytics(7, { startDate: '2026-06-01', endDate: '2026-07-01', currency: 'LOCAL' });
    await fetchTikTokShopVideoAnalytics(7, {
      startDate: '2026-06-01', endDate: '2026-07-01', currency: 'LOCAL', accountType: 'ALL', sortField: 'gmv', sortOrder: 'DESC', pageSize: 100,
    });
    await fetchTikTokShopVideoPerformance(7, {
      startDate: '2026-06-01', endDate: '2026-07-01', currency: 'LOCAL', exportId: 12, page: 2, pageSize: 100,
    });
    await syncTikTokShopVideoPerformance(7, {
      start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL',
    });
    const controller = new AbortController();
    await syncTikTokShopAnalytics(7, { start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL' }, controller.signal);

    assert.equal(calls[0].url, '/api/tiktok-shop/oauth/start');
    assert.equal(calls[1].url, '/api/tiktok-shop/shops/7/analytics?start_date=2026-06-01&end_date=2026-07-01&currency=LOCAL');
    assert.equal(calls[2].url, '/api/tiktok-shop/shops/7/video-analytics?start_date=2026-06-01&end_date=2026-07-01&currency=LOCAL&account_type=ALL&sort_field=gmv&sort_order=DESC&page_size=100');
    assert.equal(calls[3].url, '/api/tiktok-shop/shops/7/video-performance?start_date=2026-06-01&end_date=2026-07-01&currency=LOCAL&export_id=12&page=2&page_size=100');
    assert.equal(calls[4].url, '/api/tiktok-shop/shops/7/video-performance/sync');
    assert.equal(calls[4].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[4].options.body), {
      start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL',
    });
    assert.equal(calls[5].url, '/api/tiktok-shop/shops/7/analytics/sync');
    assert.equal(calls[5].options.method, 'POST');
    assert.equal(calls[5].options.signal, controller.signal);
    assert.deepEqual(JSON.parse(calls[5].options.body), {
      start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL',
    });
  });
});

test('Channel report helper supports month presets and custom date ranges', async () => {
  await withBrowser(async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchChannelReport({ month: '2026-07', teamId: '4', userId: '9', channelId: '3' });
    await fetchChannelReport({ startDate: '2026-07-05', endDate: '2026-07-12' });
    await fetchChannelReportMemberDetail(9, { month: '2026-07', teamId: '4', channelId: '3', page: 2, pageSize: 10 });

    assert.equal(calls[0], '/api/reports/channel?page=1&page_size=20&month=2026-07&team_id=4&user_id=9&channel_ids=3');
    assert.equal(calls[1], '/api/reports/channel?page=1&page_size=20&start_date=2026-07-05&end_date=2026-07-12');
    assert.equal(calls[2], '/api/reports/channel/members/9?page=2&page_size=10&month=2026-07&team_id=4&channel_ids=3');
  });
});

test('Booking KOC detail helper sends the selected performance period', async () => {
  await withBrowser(async () => {
    let requestUrl;
    globalThis.fetch = async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchBookingTargetKocDetail({
      shopId: 3,
      creatorOpenId: 'creator-open-id',
      username: 'demo.creator',
      windowType: 'PAST_30_DAYS',
    });

    assert.equal(requestUrl, '/api/bookings/target-kocs/detail?shop_id=3&creator_open_id=creator-open-id&username=demo.creator&window_type=PAST_30_DAYS');
  });
});

test('Booking list helper sends the table reference period', async () => {
  await withBrowser(async () => {
    let requestUrl;
    globalThis.fetch = async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchBookings(undefined, { windowType: 'PAST_7_DAYS' });

    assert.equal(requestUrl, '/api/bookings?window_type=PAST_7_DAYS');
  });
});

test('Booking list helper sends an inclusive custom date range', async () => {
  await withBrowser(async () => {
    let requestUrl;
    globalThis.fetch = async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchBookings(undefined, {
      windowType: 'CUSTOM',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    assert.equal(requestUrl, '/api/bookings?window_type=CUSTOM&start_date=2026-07-01&end_date=2026-07-31');
  });
});

test('Creator OAuth helper sends either creator_id or the explicit create_koc intent', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('creator-admin'));
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ authorizeUrl: 'https://services.example.test/authorize' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await startTikTokPartnerOauth('/manage/koc-performance', { creatorId: 42 });
    await startTikTokPartnerOauth('/manage/koc-performance', { createKoc: true });

    assert.equal(calls[0], '/api/bookings/tiktok-partner/oauth/start?return_path=%2Fmanage%2Fkoc-performance&creator_id=42');
    assert.equal(calls[1], '/api/bookings/tiktok-partner/oauth/start?return_path=%2Fmanage%2Fkoc-performance&create_koc=true');
  });
});

test('Video thumbnail helper encodes the TikTok identity and preserves abort signal', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('thumbnail-admin'));
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ thumbnail_url: 'https://example.test/cover.webp' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const controller = new AbortController();
    await fetchTikTokShopVideoThumbnail(7, '7657874522896436487', 'creator.name', controller.signal);
    assert.equal(request.url, '/api/tiktok-shop/shops/7/video-thumbnails/7657874522896436487?username=creator.name');
    assert.equal(request.options.signal, controller.signal);
  });
});

test('Creator Marketplace helper sends the discovery keyword and pagination', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('marketplace-admin'));
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ creators: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const controller = new AbortController();
    await fetchTikTokSellerMarketplaceCreators(7, {
      keyword: '@demo.creator', pageToken: 'next-page', pageSize: 20, searchKey: 'stable-search', signal: controller.signal,
    });

    assert.equal(request.url, '/api/tiktok-shop/shops/7/affiliate/marketplace-creators?page_token=next-page&page_size=20&keyword=%40demo.creator&search_key=stable-search');
    assert.equal(request.options.signal, controller.signal);
  });
});

test('Creator Marketplace detail helper encodes the creator id', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('marketplace-detail-admin'));
    let requestUrl;
    globalThis.fetch = async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify({ creator: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchTikTokSellerMarketplaceCreator(7, 'creator/open id');

    assert.equal(requestUrl, '/api/tiktok-shop/shops/7/affiliate/marketplace-creators/creator%2Fopen%20id');
  });
});
