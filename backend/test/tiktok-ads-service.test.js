const assert = require('node:assert/strict');
const test = require('node:test');
const { createTikTokAdsService } = require('../src/services/tiktokAdsService');

test('getAuthUrl generates valid TikTok Business OAuth URL', async () => {
  const service = createTikTokAdsService();
  const url = await service.getAuthUrl('test_state');
  assert.match(url, /^https:\/\/business-api\.tiktok\.com\/portal\/auth\?/);
  assert.match(url, /app_id=7709534514481283092/);
  assert.match(url, /state=test_state/);
  assert.match(url, /redirect_uri=/);
});

test('handleOAuthCallback exchanges auth_code and persists authorization', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, ...options });
    return {
      json: async () => ({
        code: 0,
        message: 'OK',
        data: {
          access_token: 'fake_access_token_123',
          advertiser_ids: ['7123456789012345678'],
          scope: 'ad.read',
        },
      }),
    };
  };

  const queries = [];
  const fakeDb = {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const result = await service.handleOAuthCallback('test_auth_code_xyz');

  assert.equal(result.accessToken, 'fake_access_token_123');
  assert.deepEqual(result.advertiserIds, ['7123456789012345678']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /oauth2\/access_token/);
  const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO tiktok_ads_authorizations'));
  assert.ok(insertQuery);
  assert.equal(insertQuery.replacements.accessToken, 'fake_access_token_123');
});

test('saveLiveSessionAds validates cost and persists ads cost', async () => {
  const queries = [];
  const fakeDb = {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      return [];
    },
  };

  const service = createTikTokAdsService({ db: fakeDb });
  const saved = await service.saveLiveSessionAds({
    shopId: 10,
    sessionId: 'room_999',
    adsCost: 304.95,
    currency: 'MYR',
    source: 'manual',
  });

  assert.equal(saved.ads_cost, 304.95);
  assert.equal(saved.shop_id, 10);
  assert.equal(saved.session_id, 'room_999');
  assert.match(queries[0].sql, /INSERT INTO live_session_ads/);
  assert.equal(queries[0].replacements.adsCost, 304.95);

  // Clearing ads cost
  await service.saveLiveSessionAds({
    shopId: 10,
    sessionId: 'room_999',
    adsCost: null,
  });
  assert.match(queries[1].sql, /DELETE FROM live_session_ads/);
});

test('syncLiveSessionAds pulls GMV Max report and persists into live_session_ads', async () => {
  const fetchCalls = [];
  const fakeFetch = async (url) => {
    fetchCalls.push(url);
    if (url.includes('/gmv_max/store/list/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: { list: [{ store_id: 'store_123', store_name: 'Test Store' }] },
        }),
      };
    }
    if (url.includes('/gmv_max/report/get/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            list: [
              {
                dimensions: { room_id: '770947923089', store_id: 'store_123' },
                metrics: { cost: '304.95', gross_revenue: '366.00', orders: 2 },
              },
            ],
          },
        }),
      };
    }
    if (url.includes('/report/integrated/get/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: { list: [] },
        }),
      };
    }
    return { json: async () => ({ code: 0, data: {} }) };
  };

  const queries = [];
  const fakeDb = {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      if (sql.includes('SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations')) {
        return [{ access_token: 'valid_token_xyz', advertiser_ids: ['adv_777'] }];
      }
      if (sql.includes('FROM tiktok_shops')) {
        return [{ id: 5, name: 'Actiscar Live', platform_shop_id: 'store_123', region: 'MY' }];
      }
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const results = await service.syncLiveSessionAds({ shopId: 5 });

  assert.equal(results.length, 1);
  assert.equal(results[0].session_id, '770947923089');
  assert.equal(results[0].ads_cost, 304.95);

  const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO live_session_ads'));
  assert.ok(insertQuery);
  assert.equal(insertQuery.replacements.adsCost, 304.95);
  assert.equal(insertQuery.replacements.sessionId, '770947923089');
  assert.equal(insertQuery.replacements.shopId, 5);
  assert.equal(insertQuery.replacements.currency, 'MYR');
  assert.ok(insertQuery.replacements.rawData.includes('304.95'));
});

test('syncLiveSessionAds ignores non-GMV-Max Auction reports so daily campaign spend is never mixed into live sessions', async () => {
  const fetchCalls = [];
  const fakeFetch = async (url) => {
    fetchCalls.push(url);
    if (url.includes('/gmv_max/store/list/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: { list: [{ store_id: 'store_123', store_name: 'Test Store' }] },
        }),
      };
    }
    if (url.includes('/report/integrated/get/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            list: [
              {
                dimensions: {
                  campaign_id: '123456',
                  stat_time_day: '2026-11-18 00:00:00',
                },
                metrics: {
                  spend: '20.05',
                  impressions: '12000',
                  clicks: '500',
                },
              },
            ],
          },
        }),
      };
    }
    return { json: async () => ({ code: 0, data: { list: [] } }) };
  };

  const queries = [];
  const fakeDb = {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      if (sql.includes('SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations')) {
        return [{ access_token: 'valid_token_xyz', advertiser_ids: ['adv_777'] }];
      }
      if (sql.includes('FROM tiktok_shops')) {
        return [{ id: 5, name: 'Actiscar Live', platform_shop_id: 'store_123', region: 'MY' }];
      }
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const testSessions = [
    {
      session_id: '770947923089',
      shop_id: 5,
      start_time: new Date('2026-11-18T19:57:00+08:00').getTime(),
      title: 'Actiscar Live Nana',
      gmv: 365.90,
    },
  ];

  const results = await service.syncLiveSessionAds({ shopId: 5, sessions: testSessions });

  assert.equal(results.length, 0);
  assert.equal(fetchCalls.some((u) => u.includes('/report/integrated/get/')), false);
  const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO live_session_ads'));
  assert.equal(insertQuery, undefined);
});

test('getLiveSessionAds defaults to sync=false and reads directly from database without fetching', async () => {
  let fetchCalled = false;
  const fakeFetch = async () => { fetchCalled = true; };
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT shop_id, session_id, ads_cost')) {
        return [
          { shop_id: 1, session_id: 'live_1', ads_cost: 50.0, currency: 'USD' },
        ];
      }
      return [];
    },
  };
  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const rows = await service.getLiveSessionAds(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, 'live_1');
  assert.equal(fetchCalled, false);
});

test('getAuthorizations returns authorization rows and advertiser accounts', async () => {
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT id, app_id, access_token, advertiser_ids')) {
        return [
          {
            id: 1,
            app_id: 'app_123',
            access_token: 'token_abc',
            advertiser_ids: ['adv_1', 'adv_2'],
            scope: 'user.info.basic',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];
      }
      return [];
    },
  };
  const fakeFetch = async () => ({
    json: async () => ({
      code: 0,
      data: {
        list: [
          { advertiser_id: 'adv_1', advertiser_name: 'Store Ads 1' },
          { advertiser_id: 'adv_2', advertiser_name: 'Store Ads 2' },
        ],
      },
    }),
  });

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const result = await service.getAuthorizations();
  assert.equal(result.totalAdvertisers, 2);
  assert.equal(result.authorizations.length, 1);
  assert.equal(result.authorizations[0].advertisers[0].name, 'Store Ads 1');
});

test('deleteAuthorization executes delete on database', async () => {
  const executed = [];
  const fakeDb = {
    query: async (sql, options) => {
      executed.push({ sql, replacements: options?.replacements });
      return [];
    },
  };
  const service = createTikTokAdsService({ db: fakeDb });
  const res = await service.deleteAuthorization(5);
  assert.equal(res.success, true);
  assert.equal(executed.length, 1);
  assert.match(executed[0].sql, /DELETE FROM tiktok_ads_authorizations/);
  assert.equal(executed[0].replacements.id, 5);
});

test('removeAdvertiser removes single advertiser id from array in database', async () => {
  const executed = [];
  const fakeDb = {
    query: async (sql, options) => {
      if (sql.includes('SELECT id, advertiser_ids')) {
        return [{ id: 3, advertiser_ids: ['adv_keep', 'adv_remove'] }];
      }
      executed.push({ sql, replacements: options?.replacements });
      return [];
    },
  };
  const service = createTikTokAdsService({ db: fakeDb });
  const res = await service.removeAdvertiser(3, 'adv_remove');
  assert.equal(res.success, true);
  assert.equal(res.remaining, 1);
  assert.match(executed[0].sql, /UPDATE tiktok_ads_authorizations/);
  assert.equal(executed[0].replacements.ids, JSON.stringify(['adv_keep']));
});

test('syncLiveSessionAds correctly maps room_id to exact shop based on known live sessions', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('/gmv_max/store/list/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: { list: [{ store_id: 'store_follicas', store_name: 'Follicas' }] },
        }),
      };
    }
    if (url.includes('/gmv_max/campaign/get/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: { list: [{ campaign_id: 'camp_live_123' }] },
        }),
      };
    }
    if (url.includes('/gmv_max/report/get/')) {
      return {
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            list: [
              {
                dimensions: { room_id: 'room_for_actiscar_vn', campaign_id: 'camp_live_123' },
                metrics: { cost: '50.00', gross_revenue: '200.00' },
              },
            ],
          },
        }),
      };
    }
    return { json: async () => ({ code: 0, data: {} }) };
  };

  const queries = [];
  const fakeDb = {
    query: async (sql, options) => {
      queries.push({ sql, ...options });
      if (sql.includes('SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations')) {
        return [{ access_token: 'valid_token_xyz', advertiser_ids: ['adv_777'] }];
      }
      if (sql.includes('FROM tiktok_shops')) {
        return [
          { id: 7, name: 'Follicas', platform_shop_id: 'store_follicas', region: 'MY' },
          { id: 15, name: 'Actiscar VN', platform_shop_id: 'store_actiscar', region: 'VN' },
        ];
      }
      if (sql.includes('FROM tiktok_affiliate_order_skus')) {
        return [{ shop_id: 15, session_id: 'room_for_actiscar_vn', session_date: '2026-11-20' }];
      }
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const results = await service.syncLiveSessionAds();

  assert.equal(results.length, 1);
  assert.equal(results[0].session_id, 'room_for_actiscar_vn');
  assert.equal(results[0].shop_id, 15);
  assert.equal(results[0].ads_cost, 50.00);

  const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO live_session_ads'));
  assert.ok(insertQuery);
  assert.equal(insertQuery.replacements.shopId, 15);
  assert.equal(insertQuery.replacements.sessionId, 'room_for_actiscar_vn');
  assert.equal(insertQuery.replacements.adsCost, 50.00);
});

test('syncLiveSessionAds paginates beyond 5 campaign pages and paginates gmv_max report pages', async () => {
  const fakeFetch = async (url) => {
    const parsed = new URL(url);
    if (url.includes('/gmv_max/store/list/')) {
      return {
        json: async () => ({
          code: 0,
          data: { list: [{ store_id: 'store_1' }] },
        }),
      };
    }
    if (url.includes('/gmv_max/campaign/get/')) {
      const page = Number(parsed.searchParams.get('page') || 1);
      return {
        json: async () => ({
          code: 0,
          data: {
            list: [{ campaign_id: `camp_p${page}` }],
            page_info: { page, total_page: 6 },
          },
        }),
      };
    }
    if (url.includes('/gmv_max/report/get/')) {
      const page = Number(parsed.searchParams.get('page') || 1);
      if (page === 1) {
        return {
          json: async () => ({
            code: 0,
            data: {
              list: [
                {
                  dimensions: { room_id: 'room_page_1', campaign_id: 'camp_p1' },
                  metrics: { cost: '10.50', currency: 'USD' },
                },
              ],
              page_info: { page: 1, total_page: 2 },
            },
          }),
        };
      }
      return {
        json: async () => ({
          code: 0,
          data: {
            list: [
              {
                dimensions: { room_id: 'room_page_2', campaign_id: 'camp_p6' },
                metrics: { cost: '20.25', currency: 'USD' },
              },
            ],
            page_info: { page: 2, total_page: 2 },
          },
        }),
      };
    }
    return { json: async () => ({ code: 0, data: {} }) };
  };

  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations')) {
        return [{ access_token: 'token_paginated', advertiser_ids: ['adv_1'] }];
      }
      if (sql.includes('FROM tiktok_shops')) {
        return [{ id: 1, name: 'Shop 1', platform_shop_id: 'store_1', region: 'MY' }];
      }
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const results = await service.syncLiveSessionAds({ shopId: 1 });

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => ({ session_id: r.session_id, ads_cost: r.ads_cost, currency: r.currency })),
    [
      { session_id: 'room_page_1', ads_cost: 10.5, currency: 'USD' },
      { session_id: 'room_page_2', ads_cost: 20.25, currency: 'USD' },
    ],
  );
});

test('syncLiveSessionAds converts currency before summing multiple advertisers for the same room_id', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('api.bnm.gov.my')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { currency_code: 'USD', rate: { middle_rate: 4.0 } },
            { currency_code: 'VND', unit: 100, rate: { middle_rate: 0.016 } },
          ],
          meta: { last_updated: '2026-11-26' },
        }),
      };
    }
    if (url.includes('/gmv_max/store/list/')) {
      return {
        json: async () => ({
          code: 0,
          data: { list: [{ store_id: 'store_1' }] },
        }),
      };
    }
    if (url.includes('/gmv_max/campaign/get/')) {
      const parsed = new URL(url);
      const advId = parsed.searchParams.get('advertiser_id');
      return {
        json: async () => ({
          code: 0,
          data: { list: [{ campaign_id: `camp_${advId}` }], page_info: { page: 1, total_page: 1 } },
        }),
      };
    }
    if (url.includes('/gmv_max/report/get/')) {
      const parsed = new URL(url);
      const advId = parsed.searchParams.get('advertiser_id');
      if (advId === 'adv_usd') {
        return {
          json: async () => ({
            code: 0,
            data: {
              list: [
                {
                  dimensions: { room_id: 'room_shared', campaign_id: 'camp_adv_usd' },
                  metrics: { cost: '10.00', currency: 'USD' },
                },
              ],
              page_info: { page: 1, total_page: 1 },
            },
          }),
        };
      }
      return {
        json: async () => ({
          code: 0,
          data: {
            list: [
              {
                dimensions: { room_id: 'room_shared', campaign_id: 'camp_adv_myr' },
                metrics: { cost: '8.00', currency: 'MYR' },
              },
            ],
            page_info: { page: 1, total_page: 1 },
          },
        }),
      };
    }
    return { json: async () => ({ code: 0, data: {} }) };
  };

  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations')) {
        return [{ access_token: 'token_multi', advertiser_ids: ['adv_usd', 'adv_myr'] }];
      }
      if (sql.includes('FROM tiktok_shops')) {
        return [{ id: 1, name: 'Shop 1', platform_shop_id: 'store_1', region: 'MY' }];
      }
      return [];
    },
  };

  const service = createTikTokAdsService({
    db: fakeDb,
    fetchImpl: fakeFetch,
    getExchangeRates: async () => ({ rates: { MYR: 1, USD: 4.0, VND: 0.00016 } }),
  });
  const results = await service.syncLiveSessionAds({ shopId: 1 });

  assert.equal(results.length, 1);
  assert.equal(results[0].session_id, 'room_shared');
  assert.equal(results[0].currency, 'USD');
  assert.equal(results[0].ads_cost, 12);
});



