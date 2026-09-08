const crypto = require('crypto');
const { monitoredFetch } = require('./scheduledRunMonitorService');
const { encryptPartnerToken, decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const DEFAULT_API_BASE_URL = 'https://open-api.tiktokglobalshop.com';
const DEFAULT_AUTHORIZE_URL = 'https://shop.tiktok.com/alliance/creator/auth';
const DEFAULT_TOKEN_BASE_URL = 'https://auth.tiktok-shops.com/api/v2/token';
const TARGET_COLLABORATIONS_PATH = '/affiliate_creator/202405/target_collaborations/search';
const CREATOR_PROFILE_PATH = '/affiliate_creator/202508/profiles';
const SHOWCASE_PRODUCTS_PATH = '/affiliate_creator/202405/showcases/products';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const CREATOR_PROFILE_SCOPE = 'creator.affiliate.info';
const CREATOR_SHOWCASE_SCOPE = 'creator.showcase.read';
const CREATOR_COLLABORATION_SCOPE = 'creator.affiliate_collaboration.read';

const getConfig = () => ({
  appKey: String(process.env.TIKTOK_PARTNER_APP_KEY || '').trim(),
  appSecret: String(process.env.TIKTOK_PARTNER_APP_SECRET || '').trim(),
  redirectUri: String(process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim(),
  apiBaseUrl: String(process.env.TIKTOK_PARTNER_API_BASE_URL || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, ''),
  authorizeUrl: String(process.env.TIKTOK_PARTNER_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL).trim(),
  tokenBaseUrl: String(process.env.TIKTOK_PARTNER_TOKEN_BASE_URL || DEFAULT_TOKEN_BASE_URL).trim().replace(/\/+$/, ''),
  pageSize: Math.min(100, Math.max(1, Number(process.env.TIKTOK_PARTNER_PAGE_SIZE || 20) || 20)),
});

const assertAppConfigured = (config, { requireRedirect = false } = {}) => {
  const values = [
    ['TIKTOK_PARTNER_APP_KEY', config.appKey],
    ['TIKTOK_PARTNER_APP_SECRET', config.appSecret],
    ...(requireRedirect ? [['TIKTOK_PARTNER_REDIRECT_URI', config.redirectUri]] : []),
  ];
  const missing = values.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`TikTok Partner is not configured. Set ${missing.join(', ')} in backend/.env.`);
};

const signState = (payload, appSecret) => crypto.createHmac('sha256', appSecret).update(payload).digest('base64url');

const buildAuthorizationUrl = (options = {}) => {
  const normalizedOptions = typeof options === 'string' ? { returnPath: options } : options;
  const returnPath = normalizedOptions.returnPath || '/bookings';
  const creatorId = Number(normalizedOptions.creatorId);
  const config = getConfig();
  assertAppConfigured(config, { requireRedirect: true });
  const payload = Buffer.from(JSON.stringify({
    oauthType: 'creator',
    returnPath: ['/bookings', '/manage/koc-performance'].includes(returnPath) ? returnPath : '/bookings',
    creator_id: Number.isInteger(creatorId) && creatorId > 0 ? creatorId : null,
    create_koc: normalizedOptions.createKoc === true,
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const state = `${payload}.${signState(payload, config.appSecret)}`;
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('app_key', config.appKey);
  url.searchParams.set('state', state);
  return url.toString();
};

const grantedScopesOf = (authorization) => {
  const value = authorization?.granted_scopes;
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Older rows may contain a comma-delimited scope list.
  }
  return String(value).split(',').map((scope) => scope.trim()).filter(Boolean);
};

const parseAuthorizationState = (state) => {
  const config = getConfig();
  assertAppConfigured(config);
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('TikTok Partner OAuth state is invalid.');
  const expected = signState(payload, config.appSecret);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('TikTok Partner OAuth state signature is invalid.');
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('TikTok Partner OAuth state payload is invalid.');
  }
  if (decoded.expiresAt < Date.now()) {
    throw new Error('TikTok Partner OAuth state is invalid or expired.');
  }
  return decoded;
};

const tokenRequest = async (path, params, fetchImpl = fetch) => {
  const config = getConfig();
  assertAppConfigured(config);
  const url = new URL(`${config.tokenBaseUrl}/${path}`);
  for (const [key, value] of Object.entries({ app_key: config.appKey, app_secret: config.appSecret, ...params })) {
    url.searchParams.set(key, String(value));
  }
  const response = await monitoredFetch(url, { method: 'GET', headers: { accept: 'application/json' } }, fetchImpl);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || Number(payload.code) !== 0 || !payload.data?.access_token) {
    throw new Error(`TikTok Partner token error: ${payload?.message || response.statusText || `HTTP ${response.status}`}`);
  }
  return payload.data;
};

const exchangeAuthorizationCode = (code, fetchImpl) => tokenRequest('get', {
  auth_code: code,
  grant_type: 'authorized_code',
}, fetchImpl);

const refreshAuthorizationToken = (refreshToken, fetchImpl) => tokenRequest('refresh', {
  refresh_token: refreshToken,
  grant_type: 'refresh_token',
}, fetchImpl);

const expiryDate = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new Date((parsed > nowSeconds ? parsed : nowSeconds + parsed) * 1000);
};

const tokenFields = (tokenData, existing = {}) => ({
  open_id: tokenData.open_id || existing.open_id || null,
  user_type: Number(tokenData.user_type ?? existing.user_type ?? 1),
  granted_scopes: JSON.stringify(tokenData.granted_scopes || tokenData.granted_permissions || []),
  access_token_encrypted: encryptPartnerToken(tokenData.access_token),
  refresh_token_encrypted: tokenData.refresh_token
    ? encryptPartnerToken(tokenData.refresh_token)
    : existing.refresh_token_encrypted || null,
  access_token_expires_at: expiryDate(tokenData.access_token_expire_in || tokenData.expires_in),
  refresh_token_expires_at: expiryDate(tokenData.refresh_token_expire_in || tokenData.refresh_expires_in)
    || existing.refresh_token_expires_at || null,
  updated_at: new Date(),
});

const getUsableAccessToken = async (authorization, fetchImpl = fetch) => {
  const expiresAt = authorization.access_token_expires_at
    ? new Date(authorization.access_token_expires_at).getTime()
    : NaN;
  if (authorization.access_token_encrypted && Number.isFinite(expiresAt) && expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return decryptPartnerToken(authorization.access_token_encrypted);
  }
  if (!authorization.refresh_token_encrypted) throw new Error('TikTok Creator must reconnect because no refresh token is available.');
  const refreshExpiresAt = authorization.refresh_token_expires_at
    ? new Date(authorization.refresh_token_expires_at).getTime()
    : NaN;
  if (Number.isFinite(refreshExpiresAt) && refreshExpiresAt <= Date.now()) {
    throw new Error('TikTok Creator authorization expired. Reconnect the Creator account.');
  }
  const tokenData = await refreshAuthorizationToken(decryptPartnerToken(authorization.refresh_token_encrypted), fetchImpl);
  if (Number(tokenData.user_type) !== 1) throw new Error('TikTok authorization is not a Creator token (user_type must be 1).');
  await authorization.update(tokenFields(tokenData, authorization));
  return tokenData.access_token;
};

const generateSignature = ({ path, query, body, appSecret }) => {
  const parameterString = Object.keys(query)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join('');
  const bodyString = body && Object.keys(body).length ? JSON.stringify(body) : '';
  const value = `${appSecret}${path}${parameterString}${bodyString}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(value).digest('hex');
};

const requestTikTokPartner = async ({ path, method = 'GET', query = {}, body, accessToken, fetchImpl = fetch }) => {
  const config = getConfig();
  assertAppConfigured(config);
  const signedQuery = { ...query, app_key: config.appKey, timestamp: Math.floor(Date.now() / 1000) };
  signedQuery.sign = generateSignature({ path, query: signedQuery, body, appSecret: config.appSecret });
  const url = new URL(`${config.apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(signedQuery)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await monitoredFetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-tts-access-token': accessToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, fetchImpl);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || Number(payload.code) !== 0) {
    throw new Error(`TikTok Partner API error: ${payload?.message || response.statusText || `HTTP ${response.status}`}`);
  }
  return payload;
};

const searchTargetCollaborations = async ({ authorization, accessToken, shopId, pageToken, pageSize, keyword } = {}, dependencies = {}) => {
  if (!authorization) throw new Error('TikTok Creator is not connected.');
  if (!grantedScopesOf(authorization).includes(CREATOR_COLLABORATION_SCOPE)) {
    throw new Error(`Missing ${CREATOR_COLLABORATION_SCOPE}.`);
  }
  const config = getConfig();
  const resolvedShopId = String(shopId || authorization.shop_id || '').trim();
  if (!resolvedShopId) throw new Error('Select a Seller-authorized TikTok Shop before loading Creator collaborations.');
  const resolvedAccessToken = accessToken || await getUsableAccessToken(authorization, dependencies.fetchImpl || fetch);
  const normalizedKeyword = String(keyword || '').trim();
  const body = {
    shop_id: resolvedShopId,
    ...(normalizedKeyword ? { keyword_type: 'TARGET_COLLABORATIONS_NAME', keyword: normalizedKeyword } : {}),
  };
  const payload = await requestTikTokPartner({
    path: TARGET_COLLABORATIONS_PATH,
    method: 'POST',
    query: {
      page_size: Math.min(100, Math.max(1, Number(pageSize || config.pageSize) || config.pageSize)),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
    body,
    accessToken: resolvedAccessToken,
    fetchImpl: dependencies.fetchImpl || fetch,
  });
  const data = payload.data || {};
  return {
    collaborations: Array.isArray(data.target_collaborations) ? data.target_collaborations : [],
    nextPageToken: data.next_page_token || null,
    totalCount: Number(data.total_count || 0),
    requestId: payload.request_id || null,
  };
};

const getCreatorOverview = async (authorization, dependencies = {}) => {
  if (!authorization) throw new Error('TikTok Creator is not connected.');
  const fetchImpl = dependencies.fetchImpl || fetch;
  const accessToken = await getUsableAccessToken(authorization, fetchImpl);
  const config = getConfig();
  const scopes = grantedScopesOf(authorization);
  const canUse = (scope) => scopes.includes(scope);
  const tasks = {
    profile: canUse(CREATOR_PROFILE_SCOPE)
      ? requestTikTokPartner({
      path: CREATOR_PROFILE_PATH,
      accessToken,
      fetchImpl,
      }) : Promise.reject(new Error(`Missing ${CREATOR_PROFILE_SCOPE}.`)),
    showcase: canUse(CREATOR_SHOWCASE_SCOPE)
      ? requestTikTokPartner({
      path: SHOWCASE_PRODUCTS_PATH,
      query: { page_size: Math.min(20, config.pageSize), origin: 'SHOWCASE' },
      accessToken,
      fetchImpl,
      }) : Promise.reject(new Error(`Missing ${CREATOR_SHOWCASE_SCOPE}.`)),
    collaborations: canUse(CREATOR_COLLABORATION_SCOPE)
      ? searchTargetCollaborations({
      authorization,
      accessToken,
      shopId: dependencies.shopId,
      pageSize: config.pageSize,
      }, { fetchImpl }) : Promise.reject(new Error(`Missing ${CREATOR_COLLABORATION_SCOPE}.`)),
  };
  const [profileResult, showcaseResult, collaborationsResult] = await Promise.allSettled([
    tasks.profile, tasks.showcase, tasks.collaborations,
  ]);
  const errorMessage = (result) => result.status === 'rejected' ? String(result.reason?.message || result.reason) : null;
  const profilePayload = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const showcasePayload = showcaseResult.status === 'fulfilled' ? showcaseResult.value : null;
  const collaborationsPayload = collaborationsResult.status === 'fulfilled' ? collaborationsResult.value : null;
  const showcaseData = showcasePayload?.data || {};
  const collaborationsData = collaborationsPayload || {};
  return {
    profile: profilePayload?.data || {},
    showcase: {
      products: Array.isArray(showcaseData.products) ? showcaseData.products : [],
      nextPageToken: showcaseData.next_page_token || null,
      totalCount: Number(showcaseData.total_count || showcaseData.products?.length || 0),
    },
    collaborations: Array.isArray(collaborationsData.collaborations) ? collaborationsData.collaborations : [],
    errors: {
      profile: errorMessage(profileResult),
      showcase: errorMessage(showcaseResult),
      collaborations: errorMessage(collaborationsResult),
    },
  };
};

const getCreatorProfileWithAccessToken = async (accessToken, fetchImpl = fetch) => {
  const payload = await requestTikTokPartner({
    path: CREATOR_PROFILE_PATH,
    accessToken,
    fetchImpl,
  });
  return payload.data || {};
};

module.exports = {
  TARGET_COLLABORATIONS_PATH,
  CREATOR_PROFILE_SCOPE,
  CREATOR_SHOWCASE_SCOPE,
  CREATOR_COLLABORATION_SCOPE,
  buildAuthorizationUrl,
  parseAuthorizationState,
  exchangeAuthorizationCode,
  expiryDate,
  tokenFields,
  generateSignature,
  searchTargetCollaborations,
  getCreatorOverview,
  getCreatorProfileWithAccessToken,
  grantedScopesOf,
};
