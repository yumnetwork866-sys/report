const crypto = require('crypto');
const { encryptPartnerToken, decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_SKEW_MS = 5 * 60 * 1000;
const AUTHORIZED_SHOPS_PATH = '/authorization/202309/shops';
const SHOP_PERFORMANCE_PATH = '/analytics/202509/shop/performance';
const SHOP_VIDEO_PERFORMANCE_PATH = '/analytics/202605/shop_videos/performance';
const SHOP_VIDEO_PERFORMANCE_DETAIL_PATH = '/analytics/202509/shop_videos';
const SELLER_AFFILIATE_SCOPE = 'seller.affiliate_collaboration.read';
const SELLER_CREATOR_MARKETPLACE_SCOPE = 'seller.creator_marketplace.read';
const SELLER_PRODUCT_BASIC_SCOPE = 'seller.product.basic';
const SELLER_AFFILIATE_WRITE_SCOPE = 'seller.affiliate_collaboration.write';
const SELLER_AFFILIATE_MESSAGES_SCOPE = 'seller.affiliate_messages.write';
const PRODUCT_CATEGORIES_PATH = '/product/202309/categories';
const OPEN_COLLABORATIONS_PATH = '/affiliate_seller/202412/open_collaborations/search';
const TARGET_COLLABORATIONS_PATH = '/affiliate_seller/202409/target_collaborations/search';
const TARGET_COLLABORATION_DETAIL_PATH = '/affiliate_seller/202409/target_collaborations';
const CREATE_TARGET_COLLABORATION_PATH = '/affiliate_seller/202508/target_collaborations';
const AFFILIATE_CONVERSATIONS_PATH = '/affiliate_seller/202508/conversations';
const AFFILIATE_MESSAGES_PATH = '/affiliate_seller/202412';
const AFFILIATE_ORDERS_PATH = '/affiliate_seller/202410/orders/search';
const OPEN_COLLABORATION_SETTINGS_PATH = '/affiliate_seller/202409/open_collaboration_settings';
const SAMPLE_APPLICATIONS_PATH = '/affiliate_seller/202508/sample_applications/search';
const SAMPLE_APPLICATION_FULFILLMENTS_PATH = '/affiliate_seller/202409/sample_applications';
const CREATOR_CONTENT_DETAILS_PATH = '/affiliate_seller/202508/open_collaborations/creator_content_details';
const MARKETPLACE_CREATORS_PATH = '/affiliate_seller/202508/marketplace_creators/search';
const MARKETPLACE_CREATOR_DETAIL_PATH = '/affiliate_seller/202508/marketplace_creators';
const COMPASS_CREATE_TASK_PATH = '/affiliate_seller/202603/compass/offline_task';
const COMPASS_TASK_LIST_PATH = '/affiliate_seller/202603/compass/offline_tasks';

const getConfig = () => ({
  appKey: String(process.env.TIKTOK_PARTNER_APP_KEY || '').trim(),
  appSecret: String(process.env.TIKTOK_PARTNER_APP_SECRET || '').trim(),
  serviceId: String(process.env.TIKTOK_PARTNER_SERVICE_ID || process.env.TIKTOK_SHOP_SERVICE_ID || '').trim(),
  redirectUri: String(process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim(),
  authorizeUrl: String(process.env.TIKTOK_SHOP_AUTHORIZE_URL || 'https://services.tiktokshop.com/open/authorize').trim(),
  tokenBaseUrl: String(process.env.TIKTOK_PARTNER_TOKEN_BASE_URL || 'https://auth.tiktok-shops.com/api/v2/token').trim().replace(/\/+$/, ''),
  apiBaseUrl: String(process.env.TIKTOK_PARTNER_API_BASE_URL || 'https://open-api.tiktokglobalshop.com').trim().replace(/\/+$/, ''),
  requestTimeoutMs: Math.max(1000, Number(process.env.TIKTOK_SHOP_REQUEST_TIMEOUT_MS || 15000) || 15000),
});

const assertConfigured = (config, { oauth = false } = {}) => {
  const missing = [
    ['TIKTOK_PARTNER_APP_KEY', config.appKey],
    ['TIKTOK_PARTNER_APP_SECRET', config.appSecret],
    ...(oauth ? [['TIKTOK_PARTNER_REDIRECT_URI', config.redirectUri]] : []),
    ...(oauth && !new URL(config.authorizeUrl).searchParams.get('service_id') ? [['TIKTOK_PARTNER_SERVICE_ID', config.serviceId]] : []),
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`TikTok Shop is not configured. Set ${missing.join(', ')} in backend/.env.`);
};

const signState = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const buildShopAuthorizationUrl = (returnPath = '/manage/shop-analytics') => {
  const config = getConfig();
  assertConfigured(config, { oauth: true });
  const payload = Buffer.from(JSON.stringify({
    oauthType: 'shop',
    returnPath: ['/manage/shops', '/manage/shop-analytics', '/manage/video-analytics', '/videos', '/manage/koc-performance', '/manage/affiliate'].includes(returnPath) ? returnPath : '/manage/shop-analytics',
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const state = `${payload}.${signState(payload, config.appSecret)}`;
  const url = new URL(config.authorizeUrl);
  if (!url.searchParams.get('service_id')) url.searchParams.set('service_id', config.serviceId);
  url.searchParams.set('state', state);
  return url.toString();
};

const parseShopAuthorizationState = (state) => {
  const config = getConfig();
  assertConfigured(config);
  const [payload, signature] = String(state || '').split('.');
  const expected = payload ? signState(payload, config.appSecret) : '';
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('TikTok Shop OAuth state is invalid.');
  }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('TikTok Shop OAuth state payload is invalid.'); }
  if (!data.expiresAt || data.expiresAt < Date.now()) throw new Error('TikTok Shop OAuth state is expired.');
  if (data.oauthType !== 'shop') throw new Error('TikTok Shop OAuth state has the wrong authorization type.');
  return data;
};

const tokenRequest = async (path, params, fetchImpl = fetch) => {
  const config = getConfig();
  assertConfigured(config);
  const url = new URL(`${config.tokenBaseUrl}/${path}`);
  Object.entries({ app_key: config.appKey, app_secret: config.appSecret, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || Number(payload?.code) !== 0 || !payload?.data?.access_token) throw new Error(`TikTok Shop token error: ${payload?.message || response.statusText || response.status}`);
  return payload.data;
};

const exchangeShopAuthorizationCode = (code, fetchImpl) => tokenRequest('get', { auth_code: code, grant_type: 'authorized_code' }, fetchImpl);
const refreshShopAuthorizationToken = (token, fetchImpl) => tokenRequest('refresh', { refresh_token: token, grant_type: 'refresh_token' }, fetchImpl);
const expiryDate = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const now = Math.floor(Date.now() / 1000);
  return new Date((number > now ? number : now + number) * 1000);
};

const shopTokenFields = (data, existing = {}) => ({
  open_id: data.open_id || existing.open_id || null,
  user_type: Number(data.user_type ?? existing.user_type ?? 0),
  granted_scopes: data.granted_scopes || data.granted_permissions || existing.granted_scopes || [],
  access_token_encrypted: encryptPartnerToken(data.access_token),
  refresh_token_encrypted: data.refresh_token ? encryptPartnerToken(data.refresh_token) : existing.refresh_token_encrypted || null,
  access_token_expires_at: expiryDate(data.access_token_expire_in || data.expires_in),
  refresh_token_expires_at: expiryDate(data.refresh_token_expire_in || data.refresh_expires_in) || existing.refresh_token_expires_at || null,
  updated_at: new Date(),
});

const signature = ({ path, query, body = '' }) => {
  const config = getConfig();
  const parameters = Object.keys(query).filter((key) => !['sign', 'access_token'].includes(key)).sort().map((key) => `${key}${query[key]}`).join('');
  const input = `${config.appSecret}${path}${parameters}${body}${config.appSecret}`;
  return crypto.createHmac('sha256', config.appSecret).update(input).digest('hex');
};

const parseRetryAfterMs = (value, now = Date.now()) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const retryAt = Date.parse(normalized);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
};

const requestShopApi = async ({
  path, accessToken, method = 'GET', query = {}, body, contentType = 'application/json', fetchImpl = fetch,
}) => {
  const config = getConfig();
  assertConfigured(config);
  const signed = { ...query, app_key: config.appKey, timestamp: Math.floor(Date.now() / 1000) };
  const bodyString = body && Object.keys(body).length ? JSON.stringify(body) : '';
  signed.sign = signature({ path, query: signed, body: bodyString });
  const url = new URL(`${config.apiBaseUrl}${path}`);
  Object.entries(signed).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { 'content-type': contentType, 'x-tts-access-token': accessToken },
      ...(bodyString ? { body: bodyString } : {}),
      ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
    });
  } catch (error) {
    error.endpoint = path;
    error.httpMethod = method;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || Number(payload?.code) !== 0) {
    const retryAfter = response.headers?.get?.('retry-after') || null;
    const details = [
      payload?.message || response.statusText || response.status,
      response.status ? `http_status=${response.status}` : null,
      `endpoint=${method} ${path}`,
      retryAfter ? `retry_after=${retryAfter}` : null,
      payload?.code !== undefined ? `code=${payload.code}` : null,
      payload?.request_id ? `request_id=${payload.request_id}` : null,
    ].filter(Boolean).join(', ');
    const error = new Error(`TikTok Shop API error: ${details}`);
    error.tiktokCode = payload?.code ?? null;
    error.requestId = payload?.request_id || null;
    error.httpStatus = Number(response.status) || null;
    error.endpoint = path;
    error.httpMethod = method;
    error.retryAfter = retryAfter;
    error.retryAfterMs = parseRetryAfterMs(retryAfter);
    throw error;
  }
  return payload;
};

const sumBreakdownMetric = (breakdowns, key) => (Array.isArray(breakdowns) ? breakdowns : [])
  .reduce((total, item) => total + (Number(item?.traffic?.[key]) || 0), 0);

const normalizeShopPerformance = (performance) => {
  if (!performance || !Array.isArray(performance.intervals)) return performance;
  return {
    ...performance,
    intervals: performance.intervals.map((interval) => {
      // Keep the flat 202405 fields for existing snapshots/UI while adapting the
      // nested sales/traffic response returned by Analytics API 202509.
      const sales = interval?.sales || {};
      const traffic = interval?.traffic || {};
      const trafficBreakdowns = traffic.breakdowns || [];
      const cancelAndRefunds = interval?.cancel_and_refunds;
      const gmv = interval?.gmv?.overall || sales?.gmv?.overall || sales.gmv || interval.gmv || null;
      const gmvBreakdowns = interval?.gmv?.breakdowns
        || sales?.gmv?.breakdowns
        || sales.breakdowns
        || [];
      return {
        ...interval,
        gmv,
        orders: sales.orders_count ?? sales.sku_orders_count ?? sales.orders ?? sales.sku_orders ?? interval.orders ?? 0,
        units_sold: sales.items_sold ?? interval.units_sold ?? 0,
        buyers: sales.avg_customers_count
          ?? sales.customers_count
          ?? sales.customers
          ?? sales.avg_customers
          ?? interval.buyers
          ?? 0,
        product_impressions: traffic.product_impressions
          ?? traffic.impressions
          ?? traffic.avg_visitors
          ?? interval.product_impressions
          ?? sumBreakdownMetric(trafficBreakdowns, 'impressions'),
        product_page_views: traffic.avg_page_views
          ?? traffic.page_views
          ?? interval.product_page_views
          ?? sumBreakdownMetric(trafficBreakdowns, 'page_views'),
        refunds: sales.refunds ?? interval.refunds ?? cancelAndRefunds?.refunded ?? null,
        cancellations_and_returns: cancelAndRefunds
          ? ((Number(cancelAndRefunds.canceled) || 0) + (Number(cancelAndRefunds.returned) || 0))
          : (interval.sales || interval.traffic ? null : interval.cancellations_and_returns ?? null),
        gmv_breakdowns: Array.isArray(interval.gmv_breakdowns) && interval.gmv_breakdowns.length
          ? interval.gmv_breakdowns
          : gmvBreakdowns.map((item) => ({
            type: item.type || item.content_type,
            amount: item.gmv?.amount ?? item.sales?.gmv?.amount ?? 0,
            currency: item.gmv?.currency || item.sales?.gmv?.currency || gmv?.currency || null,
          })),
      };
    }),
  };
};

const sellerAffiliateRequest = async ({
  authorization,
  shopCipher,
  path,
  method = 'POST',
  query = {},
  body,
  requiredScope = SELLER_AFFILIATE_SCOPE,
}, fetchImpl) => {
  if (!authorization) throw new Error('TikTok Seller is not connected.');
  const scopes = Array.isArray(authorization.granted_scopes) ? authorization.granted_scopes : [];
  if (!scopes.includes(requiredScope)) {
    throw new Error(`Reconnect TikTok Shop and grant ${requiredScope}.`);
  }
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  return requestShopApi({
    path,
    method,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: { shop_cipher: shopCipher, ...query },
    body,
  });
};

const searchOpenCollaborations = ({ authorization, shopCipher, pageToken, pageSize = 20, keyword } = {}, fetchImpl) => {
  const normalizedKeyword = String(keyword || '').trim();
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: OPEN_COLLABORATIONS_PATH,
    query: { page_size: pageSize, ...(pageToken ? { page_token: pageToken } : {}), sort_order: 'DESC' },
    body: normalizedKeyword ? {
      keyword_type: /^\d+$/.test(normalizedKeyword) ? 'PRODUCT_ID' : 'PRODUCT_NAME',
      keyword: normalizedKeyword,
    } : {},
  }, fetchImpl);
};

const searchTargetCollaborations = async ({ authorization, shopCipher, pageToken, pageSize = 20, keyword, status = 'ONGOING' } = {}, fetchImpl) => {
  const normalizedKeyword = String(keyword || '').trim();
  const normalizedStatus = status || 'ONGOING';
  const payload = await sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: TARGET_COLLABORATIONS_PATH,
    query: { page_size: pageSize, ...(pageToken ? { page_token: pageToken } : {}) },
    body: {
      ...(normalizedKeyword ? { search_param: { keyword_type: /^\d+$/.test(normalizedKeyword) ? 'TARGET_COLLABORATION_ID' : 'TARGET_COLLABORATION_NAME', keyword: normalizedKeyword } } : {}),
      collaboration_status: normalizedStatus,
    },
  }, fetchImpl);
  const rows = Array.isArray(payload.data?.target_collaborations) ? payload.data.target_collaborations : [];
  return {
    ...payload,
    data: {
      ...payload.data,
      target_collaborations: rows.map((row) => ({
        ...row,
        status: normalizedStatus,
        collaboration_status: normalizedStatus,
      })),
    },
  };
};

const getTargetCollaboration = ({ authorization, shopCipher, collaborationId } = {}, fetchImpl) => {
  const normalizedId = String(collaborationId || '').trim();
  if (!normalizedId) throw new Error('target collaboration id is required.');
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: `${TARGET_COLLABORATION_DETAIL_PATH}/${encodeURIComponent(normalizedId)}`,
    method: 'GET',
  }, fetchImpl);
};

const createTargetCollaboration = ({
  authorization, shopCipher, name, message, endTime, products,
  creatorOpenIds, sellerContactInfo, freeSampleRule,
} = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: CREATE_TARGET_COLLABORATION_PATH,
  requiredScope: SELLER_AFFILIATE_WRITE_SCOPE,
  body: {
    name,
    ...(message ? { message } : {}),
    end_time: String(endTime),
    products,
    creator_user_open_ids: creatorOpenIds,
    seller_contact_info: sellerContactInfo,
    free_sample_rule: freeSampleRule,
  },
}, fetchImpl);

const updateTargetCollaboration = ({
  authorization, shopCipher, collaborationId, name, endTime, products,
  creatorOpenIds, sellerContactInfo, freeSampleRule,
} = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: `${CREATE_TARGET_COLLABORATION_PATH}/${encodeURIComponent(collaborationId)}`,
  method: 'PUT',
  requiredScope: SELLER_AFFILIATE_WRITE_SCOPE,
  body: {
    name,
    end_time: String(endTime),
    products,
    creator_user_open_ids: creatorOpenIds,
    seller_contact_info: sellerContactInfo,
    free_sample_rule: freeSampleRule,
  },
}, fetchImpl);

const createAffiliateConversation = ({
  authorization, shopCipher, creatorOpenId,
} = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: AFFILIATE_CONVERSATIONS_PATH,
  requiredScope: SELLER_AFFILIATE_MESSAGES_SCOPE,
  body: {
    creator_open_id: creatorOpenId,
    only_need_conversation_id: false,
  },
}, fetchImpl);

const getAffiliateConversationMessages = ({
  authorization, shopCipher, conversationId, pageToken, pageSize = 20,
} = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: `${AFFILIATE_MESSAGES_PATH}/conversation/${encodeURIComponent(conversationId)}/messages`,
  method: 'GET',
  requiredScope: SELLER_AFFILIATE_MESSAGES_SCOPE,
  query: {
    page_size: Math.min(20, Math.max(1, Number(pageSize) || 20)),
    ...(pageToken ? { page_token: pageToken } : {}),
  },
}, fetchImpl);

const sendAffiliateMessage = ({
  authorization, shopCipher, conversationId, text,
} = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: `${AFFILIATE_MESSAGES_PATH}/conversations/${encodeURIComponent(conversationId)}/messages`,
  requiredScope: SELLER_AFFILIATE_MESSAGES_SCOPE,
  body: {
    msg_type: 'TEXT',
    content: JSON.stringify({ content: text }),
  },
}, fetchImpl);

const searchAffiliateOrders = ({ authorization, shopCipher, pageToken, pageSize = 20, startTime, endTime, programId, orderId } = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: AFFILIATE_ORDERS_PATH,
  query: { page_size: pageSize, ...(pageToken ? { page_token: pageToken } : {}) },
  body: {
    ...(startTime ? { create_time_ge: startTime } : {}),
    ...(endTime ? { create_time_lt: endTime } : {}),
    ...(programId ? { program_id: String(programId) } : {}),
    ...(orderId ? { order_id: String(orderId) } : {}),
  },
}, fetchImpl);

const attachAffiliateOrderMetadata = (orders = [], { openCollaborations = [], targetCollaborations = [] } = {}) => {
  const productsById = new Map(openCollaborations
    .filter((row) => row?.product?.id)
    .map((row) => [String(row.product.id), row.product]));
  const openProgramsById = new Map(openCollaborations
    .filter((row) => row?.id)
    .map((row) => [String(row.id), { id: String(row.id), type: 'OPEN' }]));
  const targetProgramsById = new Map(targetCollaborations
    .filter((row) => row?.id)
    .map((row) => [String(row.id), { id: String(row.id), name: row.name || null, type: 'TARGET' }]));

  return orders.map((order) => {
    const skus = Array.isArray(order?.skus) ? order.skus : [];
    const productIds = [...new Set(skus.map((sku) => sku?.product_id).filter(Boolean).map(String))];
    const programIds = [...new Set(skus
      .flatMap((sku) => [sku?.target_collaboration_id, sku?.open_collaboration_id])
      .filter(Boolean)
      .map(String))];
    return {
      ...order,
      products: productIds.map((id) => productsById.get(id) || { id }),
      programs: programIds.map((id) => targetProgramsById.get(id) || openProgramsById.get(id) || { id }),
    };
});

};

const summarizeAffiliateOrders = (orders = [], { categoryItems = [], creatorUsername, categoryId } = {}) => {
  const normalizedCreator = String(creatorUsername || '').trim().replace(/^@+/, '').toLowerCase();
  const normalizedCategory = String(categoryId || 'all');
  const categoryByProduct = new Map(categoryItems.map((item) => {
    const value = item?.toJSON ? item.toJSON() : item;
    return [String(value.product_id), value];
  }));
  const creators = new Set();
  const products = new Map();
  const matchedOrders = new Set();

  for (const order of orders) {
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const username = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '');
      if (username) creators.add(username);
      if (normalizedCreator && username.toLowerCase() !== normalizedCreator) continue;
      const productId = String(sku?.product_id || '').trim();
      if (!productId) continue;
      const categoryItem = categoryByProduct.get(productId);
      const itemCategoryId = categoryItem ? String(categoryItem.category_id) : '';
      const matchesCategory = normalizedCategory === 'all'
        || (normalizedCategory === 'uncategorized' ? !itemCategoryId : itemCategoryId === normalizedCategory);
      if (!matchesCategory) continue;

      const orderId = String(order?.id || order?.order_id || '');
      const quantity = Math.max(0, Number(sku?.quantity) || 0);
      const current = products.get(productId) || {
        product_id: productId,
        product_name: sku?.product_name || categoryItem?.title || productId,
        image_url: categoryItem?.image_url || null,
        category_id: categoryItem?.category_id || null,
        quantity: 0,
        order_ids: new Set(),
        creators: new Set(),
      };
      current.quantity += quantity;
      if (orderId) {
        current.order_ids.add(orderId);
        matchedOrders.add(orderId);
      }
      if (username) current.creators.add(username);
      products.set(productId, current);
    }
  }

  const rows = [...products.values()]
    .map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      image_url: product.image_url,
      category_id: product.category_id,
      quantity: product.quantity,
      order_count: product.order_ids.size,
      creator_count: product.creators.size,
    }))
    .sort((left, right) => right.quantity - left.quantity || left.product_name.localeCompare(right.product_name));
  return {
    rows,
    creators: [...creators].sort((left, right) => left.localeCompare(right)).map((username) => ({ username })),
    totals: {
      quantity: rows.reduce((sum, product) => sum + product.quantity, 0),
      products: rows.length,
      orders: matchedOrders.size,
    },
  };
};

const getOpenCollaborationSettings = ({ authorization, shopCipher } = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: OPEN_COLLABORATION_SETTINGS_PATH,
  method: 'GET',
}, fetchImpl);

const searchSellerSampleApplications = ({
  authorization, shopCipher, pageToken, pageSize = 20, keyword, status,
} = {}, fetchImpl) => {
  const normalizedKeyword = String(keyword || '').trim();
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: SAMPLE_APPLICATIONS_PATH,
    query: {
      page_size: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
    body: {
      ...(normalizedKeyword ? { username: normalizedKeyword } : {}),
      ...(status ? { status } : {}),
    },
  }, fetchImpl);
};

const searchSellerSampleApplicationFulfillments = ({
  authorization, shopCipher, applicationId, contentFormat,
} = {}, fetchImpl) => {
  const normalizedApplicationId = String(applicationId || '').trim();
  if (!normalizedApplicationId) throw new Error('application_id is required.');
  const normalizedContentFormat = String(contentFormat || '').trim().toUpperCase();
  if (normalizedContentFormat && !['VIDEO', 'LIVE'].includes(normalizedContentFormat)) {
    throw new Error('content_format must be VIDEO or LIVE.');
  }
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: `${SAMPLE_APPLICATION_FULFILLMENTS_PATH}/${encodeURIComponent(normalizedApplicationId)}/fulfillments/search`,
    body: normalizedContentFormat ? { content_format: normalizedContentFormat } : {},
  }, fetchImpl);
};

const summarizeSampleFulfillments = (fulfillments) => {
  const contents = new Map();
  for (const fulfillment of Array.isArray(fulfillments) ? fulfillments : []) {
    const content = fulfillment?.content;
    if (!content || typeof content !== 'object') continue;
    const key = String(content.id || [
      content.format,
      content.url || content.page_link,
      content.create_time,
    ].filter(Boolean).join(':'));
    if (!key) continue;
    const existing = contents.get(key);
    if (!existing || Number(content.view_count || 0) > Number(existing.view_count || 0)) {
      contents.set(key, content);
    }
  }
  return {
    sample_content_count: contents.size,
    sample_content_views: contents.size
      ? [...contents.values()].reduce((total, content) => total + (Number(content.view_count) || 0), 0)
      : null,
  };
};

const searchMarketplaceCreators = ({
  authorization, shopCipher, pageToken, pageSize = 20, keyword, searchKey, filters = {},
} = {}, fetchImpl) => {
  const normalizedKeyword = String(keyword || '').trim().replace(/^@+/, '');
  const supportedFilterFields = [
    'follower_demographics',
    'gmv_ranges',
    'units_sold_ranges',
    'category',
    'content_performance',
    'affiliate_data',
    'advanced_filters',
  ];
  const filterBody = Object.fromEntries(
    supportedFilterFields
      .filter((field) => filters[field] !== undefined)
      .map((field) => [field, filters[field]]),
  );
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: MARKETPLACE_CREATORS_PATH,
    requiredScope: SELLER_CREATOR_MARKETPLACE_SCOPE,
    query: {
      page_size: [12, 20].includes(Number(pageSize)) ? Number(pageSize) : 20,
      ...(pageToken ? { page_token: pageToken } : {}),
    },
    body: {
      ...filterBody,
      ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
      ...(searchKey ? { search_key: searchKey } : {}),
    },
  }, fetchImpl);
};

const getMarketplaceCreatorPerformance = ({
  authorization, shopCipher, creatorId,
} = {}, fetchImpl) => {
  const normalizedCreatorId = String(creatorId || '').trim();
  if (!normalizedCreatorId) throw new Error('Marketplace creator id is required.');
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: `${MARKETPLACE_CREATOR_DETAIL_PATH}/${encodeURIComponent(normalizedCreatorId)}`,
    method: 'GET',
    requiredScope: SELLER_CREATOR_MARKETPLACE_SCOPE,
  }, fetchImpl);
};

const getProductCategories = ({ authorization, shopCipher, locale = 'en-US' } = {}, fetchImpl) => sellerAffiliateRequest({
  authorization,
  shopCipher,
  path: PRODUCT_CATEGORIES_PATH,
  method: 'GET',
  requiredScope: SELLER_PRODUCT_BASIC_SCOPE,
  query: {
    locale,
    category_version: 'v2',
    listing_platform: 'TIKTOK_SHOP',
    include_prohibited_categories: false,
  },
}, fetchImpl);

const getSellerCreatorContentDetails = ({
  authorization, shopCipher, productId, pageToken, pageSize = 50,
} = {}, fetchImpl) => {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) throw new Error('product_id is required.');
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: CREATOR_CONTENT_DETAILS_PATH,
    method: 'GET',
    query: {
      product_id: normalizedProductId,
      page_size: Math.min(100, Math.max(1, Number(pageSize) || 50)),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  }, fetchImpl);
};

const createCompassExportTask = ({
  authorization, shopCipher, moduleType = 'CREATOR', windowType = 'PAST_7_DAYS', endDay, planType = 'ALL',
} = {}, fetchImpl) => {
  const normalizedModuleType = String(moduleType || 'CREATOR').toUpperCase();
  if (!['CREATOR', 'BASE'].includes(normalizedModuleType)) throw new Error('module_type must be CREATOR or BASE.');
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: COMPASS_CREATE_TASK_PATH,
    body: {
      module_type: normalizedModuleType,
      window_type: windowType,
      end_day: Number(endDay),
      ...(normalizedModuleType === 'CREATOR' ? { plan_type: planType } : {}),
    },
  }, fetchImpl);
};

const listCompassExportTasks = ({ authorization, shopCipher, docType = 'CREATOR', pageSize = 50, pageToken } = {}, fetchImpl) => {
  const normalizedDocType = String(docType || 'CREATOR').toUpperCase();
  if (!['CREATOR', 'BASE'].includes(normalizedDocType)) throw new Error('doc_type must be CREATOR or BASE.');
  return sellerAffiliateRequest({
    authorization,
    shopCipher,
    path: COMPASS_TASK_LIST_PATH,
    method: 'GET',
    query: {
      doc_type: normalizedDocType,
      page_size: Math.min(100, Math.max(1, Number(pageSize) || 50)),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  }, fetchImpl);
};

const downloadCompassExportFile = async ({ authorization, shopCipher, taskId } = {}, fetchImpl) => {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) throw new Error('Compass task_id is required.');
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  return requestShopApi({
    path: `${COMPASS_TASK_LIST_PATH}/${encodeURIComponent(normalizedTaskId)}/file`,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: { shop_cipher: shopCipher },
    contentType: 'multipart/form-data',
  });
};

const getUsableShopToken = async (authorization, fetchImpl = fetch) => {
  if (authorization.access_token_encrypted && new Date(authorization.access_token_expires_at || 0).getTime() > Date.now() + TOKEN_SKEW_MS) {
    return decryptPartnerToken(authorization.access_token_encrypted);
  }
  if (!authorization.refresh_token_encrypted) throw new Error('TikTok Shop must be connected again.');
  if (authorization.refresh_token_expires_at && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now()) throw new Error('TikTok Shop authorization expired. Reconnect the shop.');
  const data = await refreshShopAuthorizationToken(decryptPartnerToken(authorization.refresh_token_encrypted), fetchImpl);
  if (Number(data.user_type) !== 0) throw new Error('TikTok authorization is not a Seller token.');
  await authorization.update(shopTokenFields(data, authorization));
  return data.access_token;
};

const getAuthorizedShops = async (accessToken, fetchImpl) => {
  const payload = await requestShopApi({ path: AUTHORIZED_SHOPS_PATH, accessToken, fetchImpl });
  return Array.isArray(payload.data?.shops) ? payload.data.shops : [];
};

const getShopPerformance = async ({ authorization, shopCipher, startDate, endDate, currency = 'LOCAL' }, fetchImpl) => {
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  const payload = await requestShopApi({
    path: SHOP_PERFORMANCE_PATH,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: { shop_cipher: shopCipher, start_date_ge: startDate, end_date_lt: endDate, granularity: '1D', currency },
  });
  if (payload.data?.performance) payload.data.performance = normalizeShopPerformance(payload.data.performance);
  return payload;
};

const getShopVideoPerformance = async ({
  authorization,
  shopCipher,
  startDate,
  endDate,
  currency = 'LOCAL',
  accountType = 'ALL',
  sortField = 'gmv',
  sortOrder = 'DESC',
  pageSize = 50,
  pageToken,
}, fetchImpl) => {
  const scopes = Array.isArray(authorization?.granted_scopes) ? authorization.granted_scopes : [];
  if (!scopes.includes('data.shop_analytics.public.read')) {
    throw new Error('Reconnect TikTok Shop and grant data.shop_analytics.public.read.');
  }
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  return requestShopApi({
    path: SHOP_VIDEO_PERFORMANCE_PATH,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: {
      shop_cipher: shopCipher,
      start_date_ge: startDate,
      end_date_lt: endDate,
      currency: currency === 'USD' ? 'USD' : 'LOCAL',
      account_type: accountType,
      sort_field: sortField,
      sort_order: sortOrder,
      page_size: Math.min(100, Math.max(1, Number(pageSize) || 50)),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  });
};

const getShopVideoPerformanceDetails = async ({
  authorization,
  shopCipher,
  videoId,
  startDate,
  endDate,
  currency = 'LOCAL',
  granularity = 'ALL',
}, fetchImpl) => {
  const scopes = Array.isArray(authorization?.granted_scopes) ? authorization.granted_scopes : [];
  if (!scopes.includes('data.shop_analytics.public.read')) {
    throw new Error('Reconnect TikTok Shop and grant data.shop_analytics.public.read.');
  }
  const normalizedVideoId = String(videoId || '').trim();
  if (!/^\d{10,30}$/.test(normalizedVideoId)) throw new Error('A valid TikTok video id is required.');
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  return requestShopApi({
    path: `${SHOP_VIDEO_PERFORMANCE_DETAIL_PATH}/${encodeURIComponent(normalizedVideoId)}/performance`,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: {
      shop_cipher: shopCipher,
      start_date_ge: startDate,
      end_date_lt: endDate,
      granularity: granularity === '1D' ? '1D' : 'ALL',
      currency: currency === 'USD' ? 'USD' : 'LOCAL',
    },
  });
};

module.exports = {
  AUTHORIZED_SHOPS_PATH,
  SHOP_PERFORMANCE_PATH,
  SHOP_VIDEO_PERFORMANCE_PATH,
  SHOP_VIDEO_PERFORMANCE_DETAIL_PATH,
  SELLER_AFFILIATE_SCOPE,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
  SELLER_PRODUCT_BASIC_SCOPE,
  SELLER_AFFILIATE_WRITE_SCOPE,
  SELLER_AFFILIATE_MESSAGES_SCOPE,
  PRODUCT_CATEGORIES_PATH,
  OPEN_COLLABORATIONS_PATH,
  TARGET_COLLABORATIONS_PATH,
  TARGET_COLLABORATION_DETAIL_PATH,
  CREATE_TARGET_COLLABORATION_PATH,
  AFFILIATE_CONVERSATIONS_PATH,
  AFFILIATE_MESSAGES_PATH,
  AFFILIATE_ORDERS_PATH,
  SAMPLE_APPLICATIONS_PATH,
  SAMPLE_APPLICATION_FULFILLMENTS_PATH,
  CREATOR_CONTENT_DETAILS_PATH,
  MARKETPLACE_CREATORS_PATH,
  MARKETPLACE_CREATOR_DETAIL_PATH,
  COMPASS_CREATE_TASK_PATH,
  COMPASS_TASK_LIST_PATH,
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  shopTokenFields,
  signature,
  parseRetryAfterMs,
  requestShopApi,
  getAuthorizedShops,
  getShopPerformance,
  getShopVideoPerformance,
  getShopVideoPerformanceDetails,
  normalizeShopPerformance,
  searchOpenCollaborations,
  searchTargetCollaborations,
  getTargetCollaboration,
  createTargetCollaboration,
  updateTargetCollaboration,
  createAffiliateConversation,
  getAffiliateConversationMessages,
  sendAffiliateMessage,
  searchAffiliateOrders,
  attachAffiliateOrderMetadata,
  summarizeAffiliateOrders,
  getOpenCollaborationSettings,
  searchSellerSampleApplications,
  searchSellerSampleApplicationFulfillments,
  summarizeSampleFulfillments,
  searchMarketplaceCreators,
  getMarketplaceCreatorPerformance,
  getProductCategories,
  getSellerCreatorContentDetails,
  createCompassExportTask,
  listCompassExportTasks,
  downloadCompassExportFile,
};
