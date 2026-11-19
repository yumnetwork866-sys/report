const assert = require('node:assert/strict');
const test = require('node:test');
const { createTikTokAdsService } = require('../src/services/tiktokAdsService');

test('getAuthUrl generates valid TikTok Business OAuth URL', () => {
  const service = createTikTokAdsService();
  const url = service.getAuthUrl('test_state');
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

  const service = createTikTokAdsService({ db: fakeDb, fetchImpl: fakeFetch });
  const result = await service.handleOAuthCallback('test_auth_code_xyz');

  assert.equal(result.accessToken, 'fake_access_token_123');
  assert.deepEqual(result.advertiserIds, ['7123456789012345678']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /oauth2\/access_token/);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO tiktok_ads_authorizations/);
  assert.equal(queries[0].replacements.accessToken, 'fake_access_token_123');
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

