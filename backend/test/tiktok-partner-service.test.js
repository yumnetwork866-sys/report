const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  TARGET_COLLABORATIONS_PATH,
  buildAuthorizationUrl,
  parseAuthorizationState,
  generateSignature,
  getCreatorOverview,
  searchTargetCollaborations,
} = require('../src/services/tiktokPartnerService');
const { encryptPartnerToken } = require('../src/lib/tiktokPartnerTokenEncryption');

const ENV_KEYS = [
  'TIKTOK_PARTNER_APP_KEY',
  'TIKTOK_PARTNER_APP_SECRET',
  'TIKTOK_PARTNER_MY_APP_KEY',
  'TIKTOK_PARTNER_MY_APP_SECRET',
  'TIKTOK_PARTNER_MY_SERVICE_ID',
  'TIKTOK_PARTNER_VN_APP_KEY',
  'TIKTOK_PARTNER_VN_APP_SECRET',
  'TIKTOK_PARTNER_VN_SERVICE_ID',
  'TIKTOK_PARTNER_REDIRECT_URI',
  'TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY',
  'TIKTOK_PARTNER_API_BASE_URL',
];

const configure = (t) => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, {
    TIKTOK_PARTNER_APP_KEY: 'app-key',
    TIKTOK_PARTNER_APP_SECRET: 'app-secret',
    TIKTOK_PARTNER_REDIRECT_URI: 'https://api.example.test/api/bookings/tiktok-partner/callback',
    TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY: 'test-encryption-secret-at-least-32-characters',
    TIKTOK_PARTNER_API_BASE_URL: 'https://example.test',
  });
};

test('creator OAuth state binds the authorization to an existing KOC', (t) => {
  configure(t);
  const url = new URL(buildAuthorizationUrl({ returnPath: '/manage/koc-performance', creatorId: 42 }));
  assert.equal(url.searchParams.get('app_key'), 'app-key');
  const state = parseAuthorizationState(url.searchParams.get('state'));
  assert.equal(state.oauthType, 'creator');
  assert.equal(state.creator_id, 42);
  assert.equal(state.create_koc, false);
  assert.equal(state.returnPath, '/manage/koc-performance');
});

test('creator OAuth state only enables KOC creation when explicitly requested', (t) => {
  configure(t);
  const url = new URL(buildAuthorizationUrl({ returnPath: '/manage/koc-performance', createKoc: true }));
  const state = parseAuthorizationState(url.searchParams.get('state'));
  assert.equal(state.creator_id, null);
  assert.equal(state.create_koc, true);
});

test('generateSignature follows TikTok Shop HMAC-SHA256 request signing', () => {
  const appSecret = 'test-secret';
  const query = { timestamp: 1623812664, page_size: 20, app_key: 'test-key', sign: 'ignored' };
  const body = { shop_id: 'shop-1' };
  const parameterString = 'app_keytest-keypage_size20timestamp1623812664';
  const message = `${appSecret}${TARGET_COLLABORATIONS_PATH}${parameterString}${JSON.stringify(body)}${appSecret}`;
  const expected = crypto.createHmac('sha256', appSecret).update(message).digest('hex');
  assert.equal(generateSignature({ path: TARGET_COLLABORATIONS_PATH, query, body, appSecret }), expected);
});

test('searchTargetCollaborations uses the selected creator token', async (t) => {
  configure(t);
  const authorization = {
    access_token_encrypted: encryptPartnerToken('creator-token'),
    access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    shop_id: 'shop-id',
    granted_scopes: JSON.stringify(['creator.affiliate.info', 'creator.showcase.read', 'creator.affiliate_collaboration.read']),
  };
  const result = await searchTargetCollaborations({ authorization }, {
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'https://example.test');
      assert.equal(options.headers['x-tts-access-token'], 'creator-token');
      assert.deepEqual(JSON.parse(options.body), { shop_id: 'shop-id' });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: { total_count: 1, target_collaborations: [{ id: 'collaboration-1', products: [] }] },
          request_id: 'request-1',
        }),
      };
    },
  });
  assert.equal(result.totalCount, 1);
  assert.equal(result.collaborations[0].id, 'collaboration-1');
});

test('getCreatorOverview combines profile and showcase for one creator', async (t) => {
  configure(t);
  const authorization = {
    access_token_encrypted: encryptPartnerToken('creator-token'),
    access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    shop_id: 'shop-id',
    granted_scopes: JSON.stringify(['creator.affiliate.info', 'creator.showcase.read', 'creator.affiliate_collaboration.read']),
  };
  const result = await getCreatorOverview(authorization, {
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['x-tts-access-token'], 'creator-token');
      if (url.pathname.endsWith('/profiles')) {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { username: 'creator-name' } }) };
      }
      if (url.pathname.endsWith('/target_collaborations/search')) {
        assert.equal(url.searchParams.get('page_size'), '20');
        assert.deepEqual(JSON.parse(options.body), { shop_id: 'shop-id' });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            data: { total_count: 1, target_collaborations: [{ id: 'collaboration-1', products: [{ id: 'product-1' }] }] },
          }),
        };
      }
      assert.equal(url.searchParams.get('origin'), 'SHOWCASE');
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { total_count: 1, products: [{ id: 'product-1' }] } }),
      };
    },
  });
  assert.equal(result.profile.username, 'creator-name');
  assert.equal(result.showcase.totalCount, 1);
  assert.equal(result.showcase.products[0].id, 'product-1');
  assert.equal(result.collaborations[0].id, 'collaboration-1');
  assert.deepEqual(result.errors, { profile: null, showcase: null, collaborations: null });
});

test('getCreatorOverview returns partial data when optional Creator scopes are missing', async (t) => {
  configure(t);
  const authorization = {
    access_token_encrypted: encryptPartnerToken('creator-token'),
    access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    granted_scopes: JSON.stringify(['creator.affiliate.info']),
  };
  const result = await getCreatorOverview(authorization, {
    fetchImpl: async (url) => {
      assert.ok(url.pathname.endsWith('/profiles'));
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { username: 'creator-name' } }) };
    },
  });
  assert.equal(result.profile.username, 'creator-name');
  assert.deepEqual(result.showcase.products, []);
  assert.deepEqual(result.collaborations, []);
  assert.match(result.errors.showcase, /creator\.showcase\.read/);
  assert.match(result.errors.collaborations, /creator\.affiliate_collaboration\.read/);
});

test('searchTargetCollaborations rejects before the API call when its scope is missing', async (t) => {
  configure(t);
  let called = false;
  await assert.rejects(
    searchTargetCollaborations({
      authorization: {
        access_token_encrypted: encryptPartnerToken('creator-token'),
        access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
        shop_id: 'shop-id',
        granted_scopes: JSON.stringify(['creator.affiliate.info']),
      },
    }, { fetchImpl: async () => { called = true; } }),
    /creator\.affiliate_collaboration\.read/,
  );
  assert.equal(called, false);
});
