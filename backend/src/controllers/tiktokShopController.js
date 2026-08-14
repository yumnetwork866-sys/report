const crypto = require('node:crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, TikTokChannel, TikTokShopAuthorization, TikTokShop, TikTokShopAnalyticsSnapshot,
  TikTokCreatorPerformanceExport, TikTokCreatorPerformanceSnapshot,
  TikTokVideoPerformanceSnapshot,
  TikTokBasePerformanceSnapshot, TikTokMarketplaceCreator,
  TikTokMarketplaceCreatorDetail, TikTokMarketplaceDiscoveryState,
  TikTokTargetCollaborationSnapshot,
  OrderProductCategory, OrderProductCategoryItem,
} = require('../models');
const {
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  shopTokenFields,
  getAuthorizedShops,
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
  getProductCategories,
  SELLER_PRODUCT_BASIC_SCOPE,
  getSellerCreatorContentDetails,
  normalizeShopPerformance,
  getShopVideoPerformance,
} = require('../services/tiktokShopService');
const { loadShopAnalyticsPerformance } = require('../services/tiktokShopAnalyticsSyncService');
const { addMarketplaceLocalCurrency, getMyrExchangeRates } = require('../services/exchangeRateService');
const { marketplaceSearchQueueService } = require('../services/tiktokMarketplaceSearchQueueService');
const {
  createCreatorPerformanceExportWithFallback,
  createBasePerformanceExportWithFallback,
  processCreatorPerformanceExport,
  processBasePerformanceExport,
  yesterdayEndDay,
} = require('../services/tiktokCreatorPerformanceService');
const {
  VIDEO_API_MODULE_TYPE,
  importVideoPerformanceWorkbook,
  startVideoPerformanceApiSync,
} = require('../services/tiktokVideoPerformanceService');
const { createTtlPromiseCache } = require('../lib/ttlPromiseCache');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');
const {
  hydrateCreatorRows,
  syncAndHydrateCollaborationCreators,
} = require('../services/tiktokCreatorProfileService');
const {
  recordTargetCollaborationInvites,
  recordCreatorContact,
} = require('../services/tiktokCreatorContactHistoryService');
const { saveTargetCollaborationSnapshots } = require('../services/tiktokTargetCollaborationSnapshotService');
const { targetCollaborationSyncService } = require('../services/tiktokTargetCollaborationSyncService');
const { upsertShopProducts } = require('../services/shopProductCatalogService');

const affiliateCacheTtlValue = Number(process.env.TIKTOK_SELLER_AFFILIATE_CACHE_TTL_MS ?? 120000);
const affiliateCacheTtlMs = affiliateCacheTtlValue === 0
  ? 0
  : Math.min(300000, Math.max(60000, affiliateCacheTtlValue || 120000));
const sellerAffiliateCache = createTtlPromiseCache({ ttlMs: affiliateCacheTtlMs, maxEntries: 1000 });
const marketplaceCategoryCache = createTtlPromiseCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 100 });
const videoThumbnailCache = createTtlPromiseCache({ ttlMs: 12 * 60 * 60 * 1000, maxEntries: 10000 });
const flattenMarketplaceCategories = (categories = []) => categories.flatMap((category) => [
  category,
  ...flattenMarketplaceCategories(category?.children || category?.sub_categories || []),
]);
const addMarketplaceCategoryNames = async (creators, shop) => {
  const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
  if (!creators.length || !scopes.includes(SELLER_PRODUCT_BASIC_SCOPE)) return creators;
  const { value: categoryPayload } = await marketplaceCategoryCache.getOrLoad(String(shop.id), () => getProductCategories({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    locale: 'en-US',
  }));
  const categoryMap = new Map(flattenMarketplaceCategories(categoryPayload.data?.categories || [])
    .map((category) => [String(category.id), category]));
  return creators.map((creator) => {
    const categories = (creator.category_ids || []).map((id) => categoryMap.get(String(id))).filter(Boolean);
    return categories.length ? { ...creator, categories } : creator;
  });
};
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:3005';
const redirectUrl = (status, message, returnPath = '/manage/shop-analytics') => {
  const safeReturnPath = ['/manage/shops', '/manage/shop-analytics', '/manage/video-analytics', '/videos', '/manage/koc-performance', '/manage/affiliate'].includes(returnPath) ? returnPath : '/manage/shop-analytics';
  const url = new URL(safeReturnPath, FRONTEND_URL());
  url.searchParams.set('shop_oauth_status', status);
  if (message) url.searchParams.set('shop_oauth_message', message);
  return url.toString();
};
const dateValue = (value) => {
  const normalized = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized;
};
const idValue = (value) => /^[1-9]\d*$/.test(String(value || '')) ? Number(value) : null;
const pageSizeValue = (value) => Math.min(100, Math.max(1, Number(value) || 20));
const unixTimeValue = (value) => /^\d{1,12}$/.test(String(value || '')) ? Number(value) : null;
const safeShop = (instance) => {
  const shop = instance?.toJSON ? instance.toJSON() : { ...instance };
  delete shop.cipher;
  delete shop.authorization;
  return shop;
};
const comparableShopName = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/^@+/, '')
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en');
const getChannelAvatarIndex = async () => {
  const channels = await TikTokChannel.findAll({
    attributes: ['username', 'display_name', 'avatar_url', 'avatar_large_url'],
  });
  const index = new Map();
  for (const channel of channels) {
    const avatar = {
      avatar_url: channel.avatar_url || channel.avatar_large_url || null,
      avatar_large_url: channel.avatar_large_url || channel.avatar_url || null,
    };
    if (!avatar.avatar_url) continue;
    for (const name of [channel.display_name, channel.username]) {
      const key = comparableShopName(name);
      if (key && !index.has(key)) index.set(key, avatar);
    }
  }
  return index;
};
const addMatchingChannelAvatar = (shop, avatarIndex) => {
  const value = shop?.toJSON ? shop.toJSON() : { ...shop };
  const avatar = avatarIndex.get(comparableShopName(value.name));
  return avatar ? { ...value, ...avatar } : value;
};
const oauthErrorMessage = (error) => {
  const message = String(error?.message || '');
  if (/state is (?:invalid|expired)|authorization was denied|Seller token/i.test(message)) return message;
  return 'TikTok Shop OAuth could not be completed. Please try again.';
};

const startShopOauth = async (req, res) => {
  try { res.json({ authorizeUrl: buildShopAuthorizationUrl(req.query.return_path) }); }
  catch (error) { res.status(error.message.includes('not configured') ? 503 : 500).json({ message: error.message }); }
};

const handleShopOauthCallback = async (req, res) => {
  let returnPath = '/manage/shop-analytics';
  try {
    const oauthState = parseShopAuthorizationState(req.query.state);
    returnPath = oauthState.returnPath;
    const code = req.query.code || req.query.auth_code;
    if (!code) throw new Error(req.query.error || 'TikTok Shop authorization was denied.');
    const tokenData = await exchangeShopAuthorizationCode(code);
    if (Number(tokenData.user_type) !== 0) throw new Error('TikTok authorization must return a Seller token (user_type=0).');
    const scopes = tokenData.granted_scopes || tokenData.granted_permissions || [];
    const normalizedScopes = Array.isArray(scopes) ? scopes : String(scopes).split(',').map((item) => item.trim()).filter(Boolean);
    const existing = tokenData.open_id ? await TikTokShopAuthorization.findOne({ where: { open_id: tokenData.open_id } }) : null;
    const values = {
      ...shopTokenFields({ ...tokenData, granted_scopes: normalizedScopes }, existing || {}),
      connected_at: new Date(), last_sync_status: 'success', last_sync_error: null,
    };
    const shops = await getAuthorizedShops(tokenData.access_token);
    const validShops = shops.filter((item) => item?.id && item?.cipher);
    await sequelize.transaction(async (transaction) => {
      const authorization = existing
        ? await existing.update(values, { transaction })
        : await TikTokShopAuthorization.create(values, { transaction });
      for (const shop of validShops) {
        await TikTokShop.upsert({
          authorization_id: authorization.id,
          platform_shop_id: String(shop.id),
          name: shop.name || shop.code || String(shop.id),
          region: shop.region || null,
          seller_type: shop.seller_type || null,
          cipher: shop.cipher,
          code: shop.code || null,
          last_sync_status: 'success',
          last_sync_error: null,
        }, { transaction });
      }
      await TikTokShop.destroy({
        where: {
          authorization_id: authorization.id,
          ...(validShops.length ? { platform_shop_id: { [Op.notIn]: validShops.map((shop) => String(shop.id)) } } : {}),
        },
        transaction,
      });
    });
    sellerAffiliateCache.clear();
    const requestedAffiliate = ['/manage/koc-performance', '/manage/affiliate'].includes(oauthState.returnPath);
    const requiredScope = requestedAffiliate ? 'seller.affiliate_collaboration.read' : 'data.shop_analytics.public.read';
    const hasRequiredScope = normalizedScopes.includes(requiredScope);
    return res.redirect(redirectUrl(
      hasRequiredScope ? 'success' : 'warning',
      hasRequiredScope
        ? `${validShops.length} TikTok Shop connected.`
        : `${validShops.length} TikTok Shop connected, but ${requiredScope} permission is missing.`,
      oauthState.returnPath,
    ));
  } catch (error) {
    console.error('[TikTok Shop OAuth] Callback failed', { message: error.message });
    return res.redirect(redirectUrl('error', oauthErrorMessage(error), returnPath));
  }
};

const listShopConnections = async (_req, res) => {
  try {
    const [authorizations, avatarIndex] = await Promise.all([
      TikTokShopAuthorization.findAll({
        attributes: { exclude: ['access_token_encrypted', 'refresh_token_encrypted'] },
        include: [{ model: TikTokShop, as: 'shops', attributes: { exclude: ['cipher'] } }],
        order: [['connected_at', 'DESC']],
      }),
      getChannelAvatarIndex(),
    ]);
    res.json(authorizations.map((authorization) => {
      const value = authorization.toJSON();
      return {
        ...value,
        shops: (value.shops || []).map((shop) => addMatchingChannelAvatar(shop, avatarIndex)),
      };
    }));
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const listShops = async (_req, res) => {
  try {
    const [shops, avatarIndex] = await Promise.all([
      TikTokShop.findAll({
        attributes: { exclude: ['cipher'] },
        include: [{ model: TikTokShopAuthorization, as: 'authorization', attributes: ['id', 'granted_scopes', 'refresh_token_expires_at'] }],
        order: [['name', 'ASC']],
      }),
      getChannelAvatarIndex(),
    ]);
    res.json(shops.map((shop) => addMatchingChannelAvatar(shop, avatarIndex)));
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getShopAnalytics = async (req, res) => {
  try {
    const shopId = idValue(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    const shop = await TikTokShop.findByPk(shopId, { attributes: { exclude: ['cipher'] } });
    if (!shop) return res.status(404).json({ message: 'TikTok Shop not found.' });
    const where = { shop_id: shop.id };
    const startDate = dateValue(req.query.start_date);
    const endDate = dateValue(req.query.end_date);
    if (startDate) where.start_date = startDate;
    if (endDate) where.end_date = endDate;
    if (['LOCAL', 'USD'].includes(req.query.currency)) where.currency = req.query.currency;
    const snapshots = await TikTokShopAnalyticsSnapshot.findAll({ where, order: [['synced_at', 'DESC']], limit: 30 });
    res.json({
      shop,
      is_fallback: false,
      requested_range: { start_date: startDate, end_date: endDate },
      snapshots: snapshots.map((snapshot) => {
        const value = snapshot.toJSON();
        return { ...value, metrics: normalizeShopPerformance(value.metrics) };
      }),
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const syncShopAnalytics = async (req, res) => {
  let shop = null;
  try {
    const shopId = idValue(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    shop = await TikTokShop.findByPk(shopId, { include: [{ model: TikTokShopAuthorization, as: 'authorization' }] });
    if (!shop) return res.status(404).json({ message: 'TikTok Shop not found.' });
    const body = req.body || {};
    const startDate = dateValue(body.start_date);
    const endDate = dateValue(body.end_date);
    const currency = body.currency === 'USD' ? 'USD' : 'LOCAL';
    if (!startDate || !endDate || startDate >= endDate) return res.status(400).json({ message: 'A valid start_date and exclusive end_date are required.' });
    const grantedScopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
    if (!grantedScopes.includes('data.shop_analytics.public.read')) {
      return res.status(403).json({ message: 'Reconnect TikTok Shop and grant data.shop_analytics.public.read.' });
    }
    const payload = await loadShopAnalyticsPerformance(shop, { startDate, endDate, currency });
    const performance = payload.data?.performance;
    if (!performance || !Array.isArray(performance.intervals)) throw new Error('TikTok Shop returned an invalid Shop Analytics response.');
    await TikTokShopAnalyticsSnapshot.upsert({
      shop_id: shop.id,
      start_date: startDate,
      end_date: endDate,
      currency,
      metrics: performance,
      latest_available_date: payload.data?.latest_available_date || null,
      request_id: payload.request_id || null,
      synced_at: new Date(),
    });
    const snapshot = await TikTokShopAnalyticsSnapshot.findOne({
      where: { shop_id: shop.id, start_date: startDate, end_date: endDate, currency },
    });
    await shop.update({ last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: null });
    await shop.authorization.update({ last_sync_status: 'success', last_sync_error: null, updated_at: new Date() });
    const collaborationSync = targetCollaborationSyncService.startShopSync(shop);
    res.json({ shop: safeShop(shop), snapshot, target_collaboration_sync: collaborationSync });
  } catch (error) {
    await shop?.update({ last_synced_at: new Date(), last_sync_status: 'failed', last_sync_error: String(error.message).slice(0, 2000) }).catch(() => {});
    await shop?.authorization?.update({ last_sync_status: 'failed', last_sync_error: String(error.message).slice(0, 2000), updated_at: new Date() }).catch(() => {});
    res.status(shop ? 424 : 500).json({
      message: error.message,
      ...(error.requestId ? { request_id: error.requestId } : {}),
    });
  }
};

const listShopVideoPerformance = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const startDate = dateValue(req.query.start_date);
    const endDate = dateValue(req.query.end_date);
    if (!startDate || !endDate || startDate >= endDate) {
      return res.status(400).json({ message: 'A valid start_date and exclusive end_date are required.' });
    }
    const allowedAccountTypes = new Set(['ALL', 'LINKED_ACCOUNTS', 'OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS', 'AFFILIATE_ACCOUNTS']);
    const allowedSortFields = new Set(['gmv', 'gpm', 'avg_customers', 'sku_orders', 'items_sold', 'views', 'click_through_rate']);
    const options = {
      startDate,
      endDate,
      currency: req.query.currency === 'USD' ? 'USD' : 'LOCAL',
      accountType: allowedAccountTypes.has(req.query.account_type) ? req.query.account_type : 'ALL',
      sortField: allowedSortFields.has(req.query.sort_field) ? req.query.sort_field : 'gmv',
      sortOrder: req.query.sort_order === 'ASC' ? 'ASC' : 'DESC',
      pageSize: pageSizeValue(req.query.page_size),
      pageToken: req.query.page_token,
    };
    const loadPerformance = async () => {
      if (isDemoAuthorization(shop.authorization)) {
        return sellerAffiliateFixture('shop-video-performance', shop, {
          ...req.query,
          ...req.params,
          account_type: options.accountType,
        });
      }
      const request = (accountType) => getShopVideoPerformance({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        ...options,
        accountType,
      });
      if (options.accountType !== 'LINKED_ACCOUNTS') return request(options.accountType);
      const [officialPayload, marketingPayload] = await Promise.all([
        request('OFFICIAL_ACCOUNTS'),
        request('MARKETING_ACCOUNTS'),
      ]);
      const videosById = new Map();
      [
        ...(officialPayload.data?.videos || []),
        ...(marketingPayload.data?.videos || []),
      ].forEach((video, index) => videosById.set(String(video.id || `video-${index}`), video));
      const numericMetric = (video) => {
        const value = options.sortField === 'gmv' || options.sortField === 'gpm'
          ? video?.[options.sortField]?.amount
          : video?.[options.sortField];
        return Number(value) || 0;
      };
      const direction = options.sortOrder === 'ASC' ? 1 : -1;
      const videos = [...videosById.values()]
        .sort((left, right) => (numericMetric(left) - numericMetric(right)) * direction)
        .slice(0, options.pageSize);
      return {
        code: 0,
        data: {
          videos,
          total_count: Number(officialPayload.data?.total_count || officialPayload.data?.videos?.length || 0)
            + Number(marketingPayload.data?.total_count || marketingPayload.data?.videos?.length || 0),
          next_page_token: null,
        },
        request_id: [officialPayload.request_id, marketingPayload.request_id].filter(Boolean).join(',') || null,
      };
    };
    const { value: payload, hit } = await sellerAffiliateCache.getOrLoad(
      affiliateCacheKey('shop-video-performance', shop, req),
      loadPerformance,
    );
    res.set('X-Shop-Video-Analytics-Cache', hit ? 'HIT' : 'MISS');
    res.json({ ...payload.data, request_id: payload.request_id || null });
  } catch (error) {
    const permissionError = /grant data\.shop_analytics\.public\.read/i.test(error.message);
    res.status(permissionError ? 403 : 502).json({
      message: error.message,
      ...(error.tiktokCode !== undefined && error.tiktokCode !== null ? { tiktok_code: Number(error.tiktokCode) } : {}),
      ...(error.requestId ? { request_id: error.requestId } : {}),
    });
  }
};

const getShopVideoThumbnail = async (req, res) => {
  try {
    const shopId = idValue(req.params.shopId);
    const videoId = /^\d{10,30}$/.test(String(req.params.videoId || ''))
      ? String(req.params.videoId)
      : null;
    const username = String(req.query.username || '').trim().replace(/^@+/, '');
    if (!shopId || !videoId || !/^[\w.]{1,64}$/.test(username)) {
      return res.status(400).json({ message: 'A valid shop, video id and TikTok username are required.' });
    }
    const shopExists = await TikTokShop.count({ where: { id: shopId } });
    if (!shopExists) return res.status(404).json({ message: 'TikTok Shop not found.' });
    const cacheKey = `${username.toLowerCase()}:${videoId}`;
    const { value, hit } = await videoThumbnailCache.getOrLoad(cacheKey, async () => {
      const videoUrl = `https://www.tiktok.com/@${username}/video/${videoId}`;
      const url = new URL('https://www.tiktok.com/oembed');
      url.searchParams.set('url', videoUrl);
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? { signal: AbortSignal.timeout(10000) }
          : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`TikTok thumbnail request failed with status ${response.status}.`);
      return {
        thumbnail_url: payload?.thumbnail_url || null,
        title: payload?.title || null,
        width: Number(payload?.thumbnail_width) || null,
        height: Number(payload?.thumbnail_height) || null,
      };
    });
    res.set('X-TikTok-Thumbnail-Cache', hit ? 'HIT' : 'MISS');
    res.json(value);
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

const loadAffiliateShop = async (req, res) => {
  const shopId = idValue(req.params.shopId);
  if (!shopId) {
    res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    return null;
  }
  const shop = await TikTokShop.findByPk(shopId, { include: [{ model: TikTokShopAuthorization, as: 'authorization' }] });
  if (!shop) {
    res.status(404).json({ message: 'TikTok Shop not found.' });
    return null;
  }
  return shop;
};

const affiliateCacheKey = (namespace, shop, req) => {
  const normalizedQuery = Object.entries(req.query || {})
    .sort(([left], [right]) => left.localeCompare(right));
  const normalizedParams = Object.entries(req.params || {})
    .sort(([left], [right]) => left.localeCompare(right));
  const authorizationVersion = shop.authorization?.updated_at
    ? new Date(shop.authorization.updated_at).getTime()
    : 0;
  return JSON.stringify([namespace, shop.id, shop.authorization_id, authorizationVersion, normalizedParams, normalizedQuery]);
};

const affiliateResponse = (namespace, operation) => async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const { value: payload, hit } = await sellerAffiliateCache.getOrLoad(
      affiliateCacheKey(namespace, shop, req),
      () => isDemoAuthorization(shop.authorization)
        ? sellerAffiliateFixture(namespace, shop, { ...req.query, ...req.params })
        : operation(shop, req),
    );
    res.set('X-Seller-Affiliate-Cache', hit ? 'HIT' : 'MISS');
    res.json({ ...payload.data, request_id: payload.request_id || null });
  } catch (error) {
    const permissionError = /grant seller\.(affiliate_collaboration|creator_marketplace)\.read/i.test(error.message);
    const rateLimited = Number(error.tiktokCode) === 36009002;
    res.status(error.statusCode || (permissionError ? 403 : rateLimited ? 429 : 502)).json({
      message: error.message,
      ...(error.tiktokCode !== undefined && error.tiktokCode !== null ? { tiktok_code: Number(error.tiktokCode) } : {}),
      ...(error.requestId ? { request_id: error.requestId } : {}),
    });
  }
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targetDetailRetryCodes = new Set([36009002, 36009037]);
const getTargetCollaborationWithRetry = async (shop, collaborationId) => {
  const retryCount = Math.min(5, Math.max(0, Number(process.env.TIKTOK_TARGET_DETAIL_RETRY_COUNT ?? 3) || 0));
  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await getTargetCollaboration({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        collaborationId,
      });
    } catch (error) {
      lastError = error;
      const rateLimited = targetDetailRetryCodes.has(Number(error.tiktokCode));
      const transientNetworkError = error.tiktokCode == null
        && /fetch|network|socket|timeout|aborted/i.test(String(error.message || ''));
      if (attempt >= retryCount || (!rateLimited && !transientNetworkError)) throw error;
      await delay(500 * (2 ** attempt));
    }
  }
  throw lastError;
};

const listOpenCollaborations = affiliateResponse('open-collaborations', async (shop, req) => {
  const payload = await searchOpenCollaborations({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    pageToken: req.query.page_token,
    pageSize: pageSizeValue(req.query.page_size),
    keyword: req.query.keyword,
  });
  await upsertShopProducts(shop.id, (payload.data?.open_collaborations || []).map((row) => row?.product));
  return payload;
});

const loadTargetCollaborationsFromTikTok = async (shop, req) => {
  const payload = await searchTargetCollaborations({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    pageToken: req.query.page_token,
    pageSize: pageSizeValue(req.query.page_size),
    keyword: req.query.keyword,
    status: ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'].includes(req.query.status) ? req.query.status : 'ONGOING',
  });
  const rows = Array.isArray(payload.data?.target_collaborations) ? payload.data.target_collaborations : [];
  // TikTok throttles this detail endpoint much more aggressively than the search
  // endpoint. Fetch sequentially so a page load does not create a burst of up to
  // 100 requests; retry only rate limits and transient transport failures.
  const detailedRows = await mapWithConcurrency(rows, 1, async (row) => {
    try {
      const detail = await getTargetCollaborationWithRetry(shop, row.id);
      return { ...row, ...detail.data?.target_collaboration };
    } catch (error) {
      console.warn('[Target Collaborations] Creator detail unavailable', {
        shopId: shop.id,
        collaborationId: row.id,
        code: error.tiktokCode || null,
        requestId: error.requestId || null,
        message: error.message,
      });
      return row;
    }
  });
  const sharedProfileRows = await syncAndHydrateCollaborationCreators(shop.id, detailedRows);
  await saveTargetCollaborationSnapshots(shop.id, sharedProfileRows);
  await recordTargetCollaborationInvites(shop.id, sharedProfileRows);
  return { ...payload, data: { ...payload.data, target_collaborations: sharedProfileRows } };
};

const listTargetCollaborations = affiliateResponse('target-collaborations', async (shop, req) => {
  const status = ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'].includes(req.query.status)
    ? req.query.status
    : 'ONGOING';
  const pageSize = pageSizeValue(req.query.page_size);
  const offset = /^\d+$/.test(String(req.query.page_token || ''))
    ? Math.max(0, Number(req.query.page_token))
    : 0;
  const keyword = String(req.query.keyword || '').trim();
  const where = {
    shop_id: shop.id,
    status,
    ...(keyword ? { name: { [Op.iLike]: `%${keyword}%` } } : {}),
  };
  const { count, rows } = await TikTokTargetCollaborationSnapshot.findAndCountAll({
    where,
    order: [['end_at', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset,
  });
  if (!count) return loadTargetCollaborationsFromTikTok(shop, req);
  const targetCollaborations = rows.map((instance) => {
    const snapshot = instance.toJSON();
    return {
      ...(snapshot.raw_data || {}),
      id: snapshot.collaboration_id,
      name: snapshot.name,
      status: snapshot.status,
      collaboration_status: snapshot.status,
      snapshot_synced_at: snapshot.synced_at,
    };
  });
  const nextOffset = offset + targetCollaborations.length;
  return {
    request_id: null,
    data: {
      target_collaborations: targetCollaborations,
      total_count: count,
      next_page_token: nextOffset < count ? String(nextOffset) : '',
      source: 'DATABASE_SNAPSHOT',
    },
  };
});

const loadTargetCollaborationSummaries = async (shop, targetIds) => {
  if (!targetIds.size) return [];
  const snapshots = await TikTokTargetCollaborationSnapshot.findAll({
    where: {
      shop_id: shop.id,
      collaboration_id: { [Op.in]: [...targetIds] },
    },
  });
  const rows = snapshots.map((instance) => {
    const snapshot = instance.toJSON();
    return {
      ...(snapshot.raw_data || {}),
      id: snapshot.collaboration_id,
      name: snapshot.name,
      status: snapshot.status,
    };
  });
  const foundIds = new Set(rows.map((row) => String(row.id)));
  const missingIds = new Set([...targetIds].filter((id) => !foundIds.has(String(id))));
  if (!missingIds.size) return rows;
  let pageToken;
  for (let page = 0; page < 5; page += 1) {
    const payload = await searchTargetCollaborations({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      pageToken,
      pageSize: 100,
      status: 'ONGOING',
    });
    const pageRows = Array.isArray(payload.data?.target_collaborations) ? payload.data.target_collaborations : [];
    rows.push(...pageRows.filter((row) => missingIds.has(String(row.id))));
    if (rows.length >= targetIds.size || !payload.data?.next_page_token) break;
    pageToken = payload.data.next_page_token;
  }
  return rows;
};

const listAffiliateOrders = affiliateResponse('orders', async (shop, req) => {
  const orderId = String(req.query.order_id || '').trim();
  const orderSearchOptions = {
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    startTime: unixTimeValue(req.query.create_time_ge),
    endTime: unixTimeValue(req.query.create_time_lt),
    programId: req.query.program_id,
  };
  let payload;
  if (orderId) {
    let pageToken = req.query.page_token;
    let lastPayload = { data: {} };
    let matchedOrders = [];
    for (let page = 0; page < 100; page += 1) {
      lastPayload = await searchAffiliateOrders({
        ...orderSearchOptions,
        pageToken,
        pageSize: 100,
      });
      const pageOrders = Array.isArray(lastPayload.data?.orders) ? lastPayload.data.orders : [];
      matchedOrders = pageOrders.filter((order) => String(order?.id || order?.order_id || '') === orderId);
      if (matchedOrders.length || !lastPayload.data?.next_page_token) break;
      pageToken = lastPayload.data.next_page_token;
    }
    payload = {
      ...lastPayload,
      data: { ...lastPayload.data, orders: matchedOrders, next_page_token: '' },
    };
  } else {
    payload = await searchAffiliateOrders({
      ...orderSearchOptions,
      pageToken: req.query.page_token,
      pageSize: pageSizeValue(req.query.page_size),
    });
  }
  const orders = Array.isArray(payload.data?.orders) ? payload.data.orders : [];
  const skus = orders.flatMap((order) => Array.isArray(order.skus) ? order.skus : []);
  const targetIds = new Set(skus.map((sku) => sku?.target_collaboration_id).filter(Boolean).map(String));
  const [openResult, targetResult] = await Promise.allSettled([
    searchOpenCollaborations({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      pageSize: 100,
    }),
    loadTargetCollaborationSummaries(shop, targetIds),
  ]);
  const openCollaborations = openResult.status === 'fulfilled'
    && Array.isArray(openResult.value.data?.open_collaborations)
    ? openResult.value.data.open_collaborations
    : [];
  const targetCollaborations = targetResult.status === 'fulfilled' ? targetResult.value : [];
  return {
    ...payload,
    data: {
      ...payload.data,
      orders: attachAffiliateOrderMetadata(orders, { openCollaborations, targetCollaborations }),
    },
  };
});

const listAffiliateOrderStatistics = affiliateResponse('order-statistics', async (shop, req) => {
  const startTime = unixTimeValue(req.query.create_time_ge);
  const endTime = unixTimeValue(req.query.create_time_lt);
  if (!startTime || !endTime || endTime <= startTime) {
    const error = new Error('A valid order statistics date range is required.');
    error.statusCode = 400;
    throw error;
  }
  const [categoryItems, categories] = await Promise.all([
    OrderProductCategoryItem.findAll({ where: { shop_id: shop.id } }),
    OrderProductCategory.findAll({ where: { shop_id: shop.id }, order: [['name', 'ASC']] }),
  ]);
  const orders = [];
  let pageToken;
  let truncated = false;
  for (let page = 0; page < 100; page += 1) {
    const payload = await searchAffiliateOrders({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      pageToken,
      pageSize: 100,
      startTime,
      endTime,
    });
    orders.push(...(Array.isArray(payload.data?.orders) ? payload.data.orders : []));
    const nextPageToken = payload.data?.next_page_token;
    if (!nextPageToken || nextPageToken === pageToken) {
      pageToken = null;
      break;
    }
    pageToken = nextPageToken;
    truncated = page === 99;
  }
  const summary = summarizeAffiliateOrders(orders, {
    categoryItems,
    creatorUsername: req.query.creator_username,
    categoryId: req.query.category_id,
  });
  const categoryNames = new Map(categories.map((category) => [String(category.id), category.name]));
  return {
    data: {
      ...summary,
      rows: summary.rows.map((row) => ({
        ...row,
        category_name: row.category_id ? categoryNames.get(String(row.category_id)) || null : null,
      })),
      categories: categories.map((category) => ({ id: category.id, name: category.name })),
      range: { start_time: startTime, end_time: endTime },
      truncated,
    },
    request_id: null,
  };
});

const sampleApplicationStatuses = new Set([
  'PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING', 'REJECT_CANCELLED',
  'OVERDUE_CANCELLED', 'UNFULFILL_CANCELLED', 'DEL_OPEN_COLLAB',
  'SELLER_NOT_SHIP_CANCELLED', 'WITHDRAW_CANCELLED', 'UNFULFILLABLE_CANCELLED',
  'OPS_CANCELLED', 'OPS_FAILED', 'OPS_COMPLETED', 'COMPLETED',
]);

const marketplaceBrowseSeed = (value) => {
  const candidate = String(value || '');
  return /^browse:[a-f0-9]{32}$/.test(candidate)
    ? candidate
    : `browse:${crypto.randomBytes(16).toString('hex')}`;
};

const completedSampleApplicationStatuses = new Set(['COMPLETED', 'OPS_COMPLETED']);
const listAffiliateCreators = affiliateResponse('creators', async (shop, req) => {
  const payload = await searchSellerSampleApplications({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    pageToken: req.query.page_token,
    pageSize: pageSizeValue(req.query.page_size),
    keyword: req.query.keyword,
    status: sampleApplicationStatuses.has(req.query.status) ? req.query.status : null,
  });
  const applications = Array.isArray(payload.data?.sample_applications)
    ? payload.data.sample_applications
    : [];
  const enrichedApplications = applications.map((application) => ({
    ...application,
    sample_content_count: completedSampleApplicationStatuses.has(application.status) ? null : 0,
    sample_content_views: null,
    sample_content_status: completedSampleApplicationStatuses.has(application.status)
      ? 'PENDING_SYNC'
      : 'NOT_POSTED',
  }));
  return {
    ...payload,
    data: {
      ...payload.data,
      sample_applications: enrichedApplications,
    },
  };
});

const showAffiliateCreatorFulfillments = affiliateResponse('creator-fulfillments', async (shop, req) => {
  const payload = await searchSellerSampleApplicationFulfillments({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    applicationId: req.params.applicationId,
  });
  const fulfillments = Array.isArray(payload.data?.fulfillments) ? payload.data.fulfillments : [];
  return {
    ...payload,
    data: {
      ...summarizeSampleFulfillments(fulfillments),
      sample_content_status: 'AVAILABLE',
      fulfillments,
    },
  };
});

const listMarketplaceCreators = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    if (isDemoAuthorization(shop.authorization)) {
      const payload = sellerAffiliateFixture('marketplace-creators', shop, { ...req.query, ...req.params });
      res.set('X-Seller-Affiliate-Cache', 'DATABASE');
      res.json({
        ...payload.data,
        creators: (payload.data?.creators || []).map((creator) => ({
          ...creator,
          ...sellerAffiliateFixture('marketplace-creator-detail', shop, {
            creatorId: creator.creator_open_id,
          }).data.creator,
        })),
        detail_refresh: { pending: false, pending_count: 0, poll_after_ms: 0 },
        discovery_source: 'DATABASE',
        request_id: payload.request_id || null,
      });
      return;
    }

    const pageSize = Math.min(50, pageSizeValue(req.query.page_size));
    const offset = /^\d+$/.test(String(req.query.page_token || ''))
      ? Math.max(0, Number(req.query.page_token))
      : 0;
    const keyword = String(req.query.keyword || '').trim().replace(/^@+/, '');
    const mostRecentFirst = req.query.sort === 'most_recent';
    const browseSeed = marketplaceBrowseSeed(req.query.search_key);
    const recentContactColumns = mostRecentFirst
      ? `,
          recent_contact.previously_invited,
          recent_contact.previously_invited_at,
          recent_contact.last_messaged_at`
      : '';
    const recentContactJoin = mostRecentFirst
      ? `
        LEFT JOIN LATERAL (
          SELECT
            GREATEST(history.last_invited_at, history.last_messaged_at) >= NOW() - INTERVAL '90 days' AS previously_invited,
            GREATEST(history.last_invited_at, history.last_messaged_at) AS previously_invited_at,
            history.last_messaged_at
          FROM (
            SELECT h.last_invited_at, h.last_messaged_at
            FROM tiktok_creator_contact_histories h
            WHERE h.shop_id = c.shop_id
              AND h.creator_open_id = c.creator_open_id
            UNION ALL
            SELECT h.last_invited_at, h.last_messaged_at
            FROM tiktok_creator_contact_histories h
            WHERE h.shop_id = c.shop_id
              AND h.username = LOWER(c.username)
              AND h.creator_open_id IS DISTINCT FROM c.creator_open_id
          ) history
          ORDER BY GREATEST(history.last_invited_at, history.last_messaged_at) DESC
          LIMIT 1
        ) recent_contact ON TRUE`
      : '';
    const rows = await sequelize.query(`
      WITH candidates AS (
        SELECT
          c.*,
          COALESCE(d.detail, '{}'::jsonb) AS detail,
          c.profile || COALESCE(d.detail, '{}'::jsonb) AS metric_payload
          ${recentContactColumns}
        FROM tiktok_marketplace_creators c
        LEFT JOIN tiktok_marketplace_creator_details d
          ON d.shop_id = c.shop_id
          AND d.creator_open_id = c.creator_open_id
        ${recentContactJoin}
        WHERE c.shop_id = :shopId
          ${keyword ? `AND (c.username ILIKE :keywordPattern OR c.nickname ILIKE :keywordPattern)` : ''}
      ), ranked AS (
        SELECT
          candidates.*,
          (CASE WHEN metric_payload ?| ARRAY['units_sold', 'items_sold'] THEN 1 ELSE 0 END
            + CASE WHEN metric_payload ?| ARRAY['avg_video_views', 'avg_ec_video_play_count', 'avg_ec_video_view_count'] THEN 1 ELSE 0 END
            + CASE WHEN metric_payload ?| ARRAY['video_engagement_rate', 'ec_video_engagement_rate', 'avg_ec_video_engagement_rate'] THEN 1 ELSE 0 END
          ) AS completeness_score,
          COUNT(*) OVER()::integer AS total_count
        FROM candidates
      ), paged AS (
        SELECT *
        FROM ranked
        ORDER BY ${mostRecentFirst
    ? 'last_messaged_at DESC NULLS LAST, last_seen_at DESC NULLS LAST, creator_open_id'
    : 'completeness_score DESC, MD5(creator_open_id || :browseSeed), creator_open_id'}
        LIMIT :pageSize OFFSET :offset
      )
      SELECT
        paged.*,
        contact.previously_invited,
        contact.previously_invited_at,
        contact.last_messaged_at
      FROM paged
      LEFT JOIN LATERAL (
        SELECT
          GREATEST(history.last_invited_at, history.last_messaged_at) >= NOW() - INTERVAL '90 days' AS previously_invited,
          GREATEST(history.last_invited_at, history.last_messaged_at) AS previously_invited_at,
          history.last_messaged_at
        FROM (
          SELECT h.last_invited_at, h.last_messaged_at
          FROM tiktok_creator_contact_histories h
          WHERE h.shop_id = paged.shop_id
            AND h.creator_open_id = paged.creator_open_id
          UNION ALL
          SELECT h.last_invited_at, h.last_messaged_at
          FROM tiktok_creator_contact_histories h
          WHERE h.shop_id = paged.shop_id
            AND h.username = LOWER(paged.username)
            AND h.creator_open_id IS DISTINCT FROM paged.creator_open_id
        ) history
        ORDER BY GREATEST(history.last_invited_at, history.last_messaged_at) DESC
        LIMIT 1
      ) contact ON TRUE
      ORDER BY ${mostRecentFirst
    ? 'paged.last_messaged_at DESC NULLS LAST, paged.last_seen_at DESC NULLS LAST, paged.creator_open_id'
    : 'paged.completeness_score DESC, MD5(paged.creator_open_id || :browseSeed), paged.creator_open_id'}
    `, {
      replacements: {
        shopId: shop.id,
        browseSeed,
        pageSize,
        offset,
        ...(keyword ? { keywordPattern: `%${keyword}%` } : {}),
      },
      type: QueryTypes.SELECT,
    });
    const count = Number(rows[0]?.total_count || 0);
    const queuedSearch = keyword && count === 0
      ? await marketplaceSearchQueueService.queueSearch(shop.id, keyword)
      : null;
    const state = await TikTokMarketplaceDiscoveryState.findByPk(shop.id);
    let creators = rows.map((row) => ({
      ...row.profile,
      ...row.detail,
      creator_open_id: row.creator_open_id,
      username: row.username || row.profile?.username,
      nickname: row.nickname || row.profile?.nickname,
      marketplace_first_seen_at: row.first_seen_at,
      marketplace_last_seen_at: row.last_seen_at,
      previously_invited: Boolean(row.previously_invited),
      previously_invited_at: row.previously_invited_at || null,
      last_messaged_at: row.last_messaged_at || null,
    }));
    let exchangeRate = null;
    try {
      const localized = await addMarketplaceLocalCurrency({ data: { creators } }, shop.region);
      creators = localized.data.creators;
      exchangeRate = localized.data.exchange_rate || null;
    } catch (error) {
      console.error('[Exchange Rate] Marketplace conversion failed', { shopId: shop.id, message: error.message });
    }
    try {
      creators = await addMarketplaceCategoryNames(creators, shop);
    } catch (error) {
      console.error('[Categories] Marketplace enrichment failed', { shopId: shop.id, message: error.message });
    }
    const nextOffset = offset + rows.length;
    res.set('X-Seller-Affiliate-Cache', 'DATABASE');
    res.json({
      creators,
      ...(exchangeRate ? { exchange_rate: exchangeRate } : {}),
      total_count: count,
      next_page_token: nextOffset < count ? String(nextOffset) : '',
      search_key: browseSeed,
      detail_refresh: { pending: false, pending_count: 0, poll_after_ms: 0 },
      discovery_source: 'DATABASE',
      search_pending: queuedSearch?.status === 'PENDING',
      search_status: queuedSearch?.status || null,
      search_poll_after_ms: queuedSearch?.status === 'PENDING' ? 60 * 1000 : 0,
      discovery_sync: state ? {
        status: state.last_status,
        crawl_status: state.crawl_status,
        segment_index: state.segment_index,
        completed_at: state.completed_at,
        next_refresh_at: state.next_refresh_at,
        last_requested_at: state.last_requested_at,
        last_succeeded_at: state.last_succeeded_at,
      } : { status: 'PENDING', last_requested_at: null, last_succeeded_at: null },
      request_id: null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const showMarketplaceCreator = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    if (isDemoAuthorization(shop.authorization)) {
      const payload = sellerAffiliateFixture('marketplace-creator-detail', shop, { ...req.query, ...req.params });
      res.json({ ...payload.data, detail_refresh: { pending: false, pending_count: 0, poll_after_ms: 0 } });
      return;
    }
    const creator = await TikTokMarketplaceCreator.findOne({
      where: { shop_id: shop.id, creator_open_id: req.params.creatorId },
    });
    if (!creator) {
      res.status(404).json({ message: 'Marketplace creator has not been discovered yet.' });
      return;
    }
    const detail = await TikTokMarketplaceCreatorDetail.findOne({
      where: { shop_id: shop.id, creator_open_id: req.params.creatorId },
    });
    res.json({
      creator: { ...creator.profile, ...detail?.detail },
      detail_refresh: { pending: false, pending_count: 0, poll_after_ms: 0 },
      discovery_source: 'DATABASE',
    });
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

const marketplaceMutationError = (res, error) => {
  const missingScope = /grant seller\.(affiliate_collaboration\.write|affiliate_messages\.write)/i.test(error.message);
  res.status(missingScope ? 403 : error.statusCode || 502).json({
    message: error.message,
    ...(error.tiktokCode !== undefined && error.tiktokCode !== null
      ? { tiktok_code: Number(error.tiktokCode) }
      : {}),
    ...(error.requestId ? { request_id: error.requestId } : {}),
  });
};

const loadMarketplaceCreatorForAction = async (shop, creatorId) => {
  const creator = await TikTokMarketplaceCreator.findOne({
    where: { shop_id: shop.id, creator_open_id: String(creatorId || '') },
  });
  if (!creator) {
    const error = new Error('Marketplace creator has not been discovered yet.');
    error.statusCode = 404;
    throw error;
  }
  return {
    ...creator.profile,
    creator_open_id: creator.creator_open_id,
    username: creator.username || creator.profile?.username,
    nickname: creator.nickname || creator.profile?.nickname,
  };
};

const createMarketplaceCreatorInvitation = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const creator = await loadMarketplaceCreatorForAction(shop, req.params.creatorId);
    const name = String(req.body?.name || '').trim();
    const message = String(req.body?.message || '').trim();
    const endTime = Number(req.body?.end_time);
    const contactEmail = String(req.body?.contact_email || '').trim();
    const whatsapp = String(req.body?.whatsapp || '').trim();
    const telegram = String(req.body?.telegram || '').trim();
    const products = (Array.isArray(req.body?.products) ? req.body.products : []).map((product) => ({
      id: String(product?.id || '').trim(),
      target_commission_rate: Number(product?.target_commission_rate),
    }));
    if (!name || name.length > 100) {
      const error = new Error('Invitation name is required and must be at most 100 characters.');
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isInteger(endTime) || endTime <= Math.floor(Date.now() / 1000)) {
      const error = new Error('Invitation end time must be in the future.');
      error.statusCode = 400;
      throw error;
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      const error = new Error('Seller contact email is invalid.');
      error.statusCode = 400;
      throw error;
    }
    if (!contactEmail && !whatsapp && !telegram) {
      const error = new Error('Add at least one supported seller contact: email, WhatsApp, or Telegram.');
      error.statusCode = 400;
      throw error;
    }
    if (!products.length || products.length > 100 || products.some((product) => (
      !product.id
      || !Number.isInteger(product.target_commission_rate)
      || product.target_commission_rate < 1
      || product.target_commission_rate > 8000
    ))) {
      const error = new Error('Select 1–100 products and use commission rates between 0.01% and 80%.');
      error.statusCode = 400;
      throw error;
    }
    let payload;
    if (isDemoAuthorization(shop.authorization)) {
      payload = {
        data: { target_collaboration: { id: `demo-invite-${Date.now()}` } },
        request_id: 'demo-create-target-collaboration',
      };
    } else {
      payload = await createTargetCollaboration({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        name,
        message,
        endTime,
        products,
        creatorOpenIds: [creator.creator_open_id],
        sellerContactInfo: {
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(whatsapp ? { whatsapp } : {}),
          ...(telegram ? { telegram } : {}),
        },
        freeSampleRule: {
          has_free_sample: Boolean(req.body?.has_free_sample),
          is_sample_approval_exempt: Boolean(req.body?.is_sample_approval_exempt),
        },
      });
    }
    await recordCreatorContact(shop.id, creator, 'invite');
    sellerAffiliateCache.clear();
    res.status(201).json({
      ...payload.data,
      request_id: payload.request_id || null,
    });
  } catch (error) {
    marketplaceMutationError(res, error);
  }
};

const addMarketplaceCreatorToInvitation = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const creator = await loadMarketplaceCreatorForAction(shop, req.params.creatorId);
    const collaborationId = String(req.params.collaborationId || '').trim();
    if (!collaborationId) {
      const error = new Error('Target collaboration ID is required.');
      error.statusCode = 400;
      throw error;
    }
    if (isDemoAuthorization(shop.authorization)) {
      await recordCreatorContact(shop.id, creator, 'invite');
      res.json({ target_collaboration: { id: collaborationId }, request_id: 'demo-update-target-collaboration' });
      return;
    }
    const detailPayload = await getTargetCollaboration({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      collaborationId,
    });
    const collaboration = detailPayload.data?.target_collaboration;
    if (!collaboration) {
      const error = new Error('TikTok did not return target collaboration details.');
      error.requestId = detailPayload.request_id || null;
      throw error;
    }
    const existingCreatorIds = (collaboration.creators || [])
      .map((item) => item.creator_open_id || item.creator_user_open_id || item.user_open_id)
      .filter(Boolean)
      .map(String);
    if (existingCreatorIds.includes(String(creator.creator_open_id))) {
      const error = new Error('This creator is already included in the selected invitation.');
      error.statusCode = 409;
      throw error;
    }
    const products = (collaboration.products || []).map((item) => {
      const product = item.product || item;
      const commissionRate = Number(
        item.commission_rate
        ?? item.target_commission_rate
        ?? item.current_commission?.rate
        ?? product.commission_rate,
      );
      return {
        id: String(product.id || item.id || ''),
        commission_rate: commissionRate,
        ...(item.target_ad_commission_rate !== undefined
          ? { target_ad_commission_rate: Number(item.target_ad_commission_rate) }
          : {}),
      };
    }).filter((item) => item.id && Number.isFinite(item.commission_rate));
    if (!products.length) {
      const error = new Error('The selected invitation has no updateable products.');
      error.statusCode = 422;
      throw error;
    }
    const payload = await updateTargetCollaboration({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      collaborationId,
      name: collaboration.name,
      endTime: collaboration.end_time,
      products,
      creatorOpenIds: [...new Set([...existingCreatorIds, String(creator.creator_open_id)])],
      sellerContactInfo: collaboration.seller_contact_info,
      freeSampleRule: collaboration.free_sample_rule,
    });
    await recordCreatorContact(shop.id, creator, 'invite');
    sellerAffiliateCache.clear();
    res.json({
      ...payload.data,
      target_collaboration: payload.data?.target_collaboration || { id: collaborationId },
      request_id: payload.request_id || null,
    });
  } catch (error) {
    marketplaceMutationError(res, error);
  }
};

const conversationFromPayload = (payload) => (
  payload?.data?.conversation
  || payload?.data?.conversations?.[0]
  || payload?.data
  || {}
);

const openCreatorConversation = async (shop, creator) => {
  if (isDemoAuthorization(shop.authorization)) {
    return {
      payload: { request_id: 'demo-create-conversation' },
      conversation: {
        id: `demo-conversation-${creator.creator_open_id}`,
        username: creator.username,
        avatar: creator.avatar?.url || creator.avatar_url || null,
        unread_count: 0,
      },
    };
  }
  const payload = await createAffiliateConversation({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    creatorOpenId: creator.creator_open_id,
  });
  const conversation = conversationFromPayload(payload);
  if (!conversation.id && !conversation.conversation_id) {
    const error = new Error('TikTok did not return a conversation ID.');
    error.requestId = payload.request_id || null;
    throw error;
  }
  return { payload, conversation };
};

const getMarketplaceCreatorConversation = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const creator = await loadMarketplaceCreatorForAction(shop, req.params.creatorId);
    const { payload, conversation } = await openCreatorConversation(shop, creator);
    const conversationId = conversation.id || conversation.conversation_id;
    const messagesPayload = isDemoAuthorization(shop.authorization)
      ? { data: { messages: [], has_more: false, next_page_token: '' } }
      : await getAffiliateConversationMessages({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        conversationId,
        pageToken: req.query.page_token,
        pageSize: pageSizeValue(req.query.page_size),
      });
    res.json({
      conversation: { ...conversation, id: conversationId },
      messages: messagesPayload.data?.messages || [],
      has_more: Boolean(messagesPayload.data?.has_more),
      next_page_token: messagesPayload.data?.next_page_token || '',
      request_id: messagesPayload.request_id || payload.request_id || null,
    });
  } catch (error) {
    marketplaceMutationError(res, error);
  }
};

const sendMarketplaceCreatorMessage = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const creator = await loadMarketplaceCreatorForAction(shop, req.params.creatorId);
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 2000) {
      const error = new Error('Message is required and must be at most 2,000 characters.');
      error.statusCode = 400;
      throw error;
    }
    const { conversation } = await openCreatorConversation(shop, creator);
    const conversationId = conversation.id || conversation.conversation_id;
    const payload = isDemoAuthorization(shop.authorization)
      ? { data: { message_id: `demo-message-${Date.now()}` }, request_id: 'demo-send-message' }
      : await sendAffiliateMessage({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        conversationId,
        text,
      });
    await recordCreatorContact(shop.id, creator, 'message');
    res.status(201).json({
      ...payload.data,
      conversation_id: conversationId,
      request_id: payload.request_id || null,
    });
  } catch (error) {
    marketplaceMutationError(res, error);
  }
};

const listCreatorContentDetails = affiliateResponse('creator-content-details', (shop, req) => getSellerCreatorContentDetails({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  productId: req.query.product_id,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
}));

const showOpenCollaborationSettings = affiliateResponse('open-collaboration-settings', (shop) => getOpenCollaborationSettings({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
}));

const disconnectShopAuthorization = async (req, res) => {
  try {
    const deleted = await TikTokShopAuthorization.destroy({ where: { id: { [Op.eq]: Number(req.params.authorizationId) || -1 } } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Shop authorization not found.' });
    sellerAffiliateCache.clear();
    res.json({ message: 'TikTok Shop authorization removed.' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const disconnectShop = async (req, res) => {
  try {
    const shopId = idValue(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'TikTok Shop ID is invalid.' });
    const shop = await TikTokShop.findByPk(shopId, { attributes: ['id', 'authorization_id', 'name'] });
    if (!shop) return res.status(404).json({ message: 'TikTok Shop not found.' });

    let authorizationRemoved = false;
    await sequelize.transaction(async (transaction) => {
      await shop.destroy({ transaction });
      const remainingShops = await TikTokShop.count({
        where: { authorization_id: shop.authorization_id },
        transaction,
      });
      if (remainingShops === 0) {
        await TikTokShopAuthorization.destroy({
          where: { id: shop.authorization_id },
          transaction,
        });
        authorizationRemoved = true;
      }
    });
    sellerAffiliateCache.clear();
    res.json({
      message: 'TikTok Shop removed.',
      shopId,
      authorizationRemoved,
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const creatorPerformanceOptions = (shop, input = {}, { allowAggregate = false } = {}) => ({
  windowType: [
    'PAST_24H',
    'PAST_7_DAYS',
    'PAST_30_DAYS',
    ...(allowAggregate ? ['PAST_180_DAYS'] : []),
  ].includes(input.window_type)
    ? input.window_type : 'PAST_7_DAYS',
  endDay: /^\d{8}$/.test(String(input.end_day || '')) ? Number(input.end_day) : yesterdayEndDay(shop.region),
  planType: ['ALL', 'TARGET', 'OPEN', 'PARTNER'].includes(input.plan_type) ? input.plan_type : 'ALL',
});

const listCreatorPerformance = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const options = creatorPerformanceOptions(shop, req.query, { allowAggregate: true });
    const requestedEndDate = `${String(options.endDay).slice(0, 4)}-${String(options.endDay).slice(4, 6)}-${String(options.endDay).slice(6, 8)}`;
    let exportRecord = null;
    let snapshotExport = null;
    let basePayload = {
      base_export: null,
      base_snapshot_export: null,
      base_is_fallback: false,
      base_snapshot: null,
    };
    if (options.windowType === 'PAST_180_DAYS') {
      const benchmark = await TikTokCreatorPerformanceSnapshot.findOne({
        where: {
          shop_id: shop.id,
          window_type: 'PAST_180_DAYS',
          plan_type: options.planType,
        },
        order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
      });
      if (benchmark) {
        snapshotExport = {
          id: `aggregate:${benchmark.start_date}:${benchmark.end_date}`,
          status: 'SUCCEEDED',
          start_date: benchmark.start_date,
          end_date: benchmark.end_date,
          window_type: 'PAST_180_DAYS',
          plan_type: benchmark.plan_type,
        };
      }
      const baseSnapshot = await TikTokBasePerformanceSnapshot.findOne({
        where: {
          shop_id: shop.id,
          window_type: 'PAST_180_DAYS',
        },
        order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
      });
      if (baseSnapshot) {
        basePayload = {
          base_export: null,
          base_snapshot_export: {
            id: `aggregate:${baseSnapshot.start_date}:${baseSnapshot.end_date}`,
            status: 'SUCCEEDED',
            start_date: baseSnapshot.start_date,
            end_date: baseSnapshot.end_date,
            window_type: 'PAST_180_DAYS',
          },
          base_is_fallback: false,
          base_snapshot: baseSnapshot,
        };
      }
    } else {
      exportRecord = await TikTokCreatorPerformanceExport.findOne({
        where: {
          shop_id: shop.id,
          module_type: 'CREATOR',
          window_type: options.windowType,
          plan_type: options.planType,
          end_date: requestedEndDate,
        },
        order: [['created_at', 'DESC']],
      });
      snapshotExport = exportRecord?.status === 'SUCCEEDED'
        ? exportRecord
        : await TikTokCreatorPerformanceExport.findOne({
          where: {
            shop_id: shop.id,
            module_type: 'CREATOR',
            window_type: options.windowType,
            plan_type: options.planType,
            status: 'SUCCEEDED',
          },
          order: [['end_date', 'DESC'], ['created_at', 'DESC']],
        });
      const baseExport = await TikTokCreatorPerformanceExport.findOne({
        where: {
          shop_id: shop.id,
          module_type: 'BASE',
          window_type: options.windowType,
          end_date: requestedEndDate,
        },
        order: [['created_at', 'DESC']],
      });
      const baseSnapshotExport = baseExport?.status === 'SUCCEEDED'
        ? baseExport
        : await TikTokCreatorPerformanceExport.findOne({
          where: {
            shop_id: shop.id,
            module_type: 'BASE',
            window_type: options.windowType,
            status: 'SUCCEEDED',
          },
          order: [['end_date', 'DESC'], ['created_at', 'DESC']],
        });
      const baseSnapshot = baseSnapshotExport
        ? await TikTokBasePerformanceSnapshot.findOne({ where: { export_id: baseSnapshotExport.id } })
        : null;
      basePayload = {
        base_export: baseExport,
        base_snapshot_export: baseSnapshotExport,
        base_is_fallback: Boolean(baseSnapshotExport && (!baseExport || String(baseExport.id) !== String(baseSnapshotExport.id))),
        base_snapshot: baseSnapshot,
      };
    }
    if (!snapshotExport) {
      return res.json({
        export: exportRecord,
        snapshot_export: null,
        is_fallback: false,
        requested_end_date: requestedEndDate,
        creators: [],
        total_count: 0,
        totals: null,
        ...basePayload,
      });
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
    const keyword = String(req.query.keyword || '').trim();
    const where = {
      shop_id: shop.id,
      start_date: snapshotExport.start_date,
      end_date: snapshotExport.end_date,
      window_type: options.windowType,
      plan_type: snapshotExport.plan_type,
      ...(keyword ? { username: { [Op.iLike]: `%${keyword}%` } } : {}),
    };
    const { count, rows } = await TikTokCreatorPerformanceSnapshot.findAndCountAll({
      where,
      order: [['affiliate_gmv', 'DESC'], ['username', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const [totals] = await sequelize.query(`
      SELECT
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate GMV') OR (raw_metrics ? 'Creator-attributed GMV'))
          THEN SUM(affiliate_gmv) END AS affiliate_gmv,
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate orders') OR (raw_metrics ? 'Attributed orders'))
          THEN SUM(affiliate_orders) END AS affiliate_orders,
        CASE WHEN BOOL_OR((raw_metrics ? 'Items sold') OR (raw_metrics ? 'Creator-attributed items sold'))
          THEN SUM(items_sold) END AS items_sold,
        CASE WHEN BOOL_OR(raw_metrics ? 'Product impressions')
          THEN SUM(product_impressions) END AS product_impressions,
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate refunded GMV') OR (raw_metrics ? 'Refunds'))
          THEN SUM(refunded_gmv) END AS refunded_gmv,
        CASE WHEN BOOL_OR(raw_metrics ? 'Est. commission')
          THEN SUM(estimated_commission) END AS estimated_commission,
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate shoppable videos') OR (raw_metrics ? 'Videos'))
          THEN SUM(shoppable_videos) END AS videos,
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate LIVE streams') OR (raw_metrics ? 'LIVE streams'))
          THEN SUM(live_streams) END AS live_streams,
        CASE WHEN BOOL_OR(raw_metrics ? 'Samples shipped')
          THEN SUM(samples_shipped) END AS samples_shipped,
        CASE WHEN BOOL_OR((raw_metrics ? 'Affiliate items refunded') OR (raw_metrics ? 'Items refunded'))
          THEN SUM(items_refunded) END AS items_refunded,
        CASE
          WHEN BOOL_OR((raw_metrics ? 'Affiliate orders') OR (raw_metrics ? 'Attributed orders'))
            AND SUM(affiliate_orders) > 0
          THEN SUM(affiliate_gmv) / SUM(affiliate_orders)
        END AS average_order_value
      FROM tiktok_creator_performance_snapshots
      WHERE shop_id = :shopId AND start_date = :startDate AND end_date = :endDate
        AND window_type = :windowType AND plan_type = :planType
    `, {
      replacements: {
        shopId: shop.id,
        startDate: snapshotExport.start_date,
        endDate: snapshotExport.end_date,
        windowType: options.windowType,
        planType: snapshotExport.plan_type,
      },
    });
    const sharedCreatorRows = await hydrateCreatorRows(
      shop.id,
      rows.map((row) => row.toJSON()),
    );
    res.json({
      export: exportRecord,
      snapshot_export: snapshotExport,
      is_fallback: !exportRecord || String(exportRecord.id) !== String(snapshotExport.id),
      requested_end_date: requestedEndDate,
      creators: sharedCreatorRows,
      total_count: count,
      totals: totals[0],
      page,
      page_size: pageSize,
      profile_refresh: { status: 'CACHE_ONLY' },
      ...basePayload,
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const syncCreatorPerformance = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const {
      exportRecord,
      requestedEndDay,
      endDay,
      fallbackDays,
    } = await createCreatorPerformanceExportWithFallback(shop, creatorPerformanceOptions(shop, req.body || {}));
    const {
      exportRecord: baseExportRecord,
      endDay: baseEndDay,
      fallbackDays: baseFallbackDays,
    } = await createBasePerformanceExportWithFallback(shop, {
      ...creatorPerformanceOptions(shop, req.body || {}),
      endDay,
    });
    if (exportRecord.status === 'PROCESSING') {
      setImmediate(() => processCreatorPerformanceExport(shop, exportRecord).catch((error) => {
        console.error('[Creator Performance] Export failed', { shopId: shop.id, taskId: exportRecord.task_id, message: error.message });
      }));
    }
    if (baseExportRecord.status === 'PROCESSING') {
      setImmediate(() => processBasePerformanceExport(shop, baseExportRecord).catch((error) => {
        console.error('[Base Performance] Export failed', { shopId: shop.id, taskId: baseExportRecord.task_id, message: error.message });
      }));
    }
    const profile_refresh_started = false;
    res.status(202).json({
      export: exportRecord,
      base_export: baseExportRecord,
      profile_refresh_started,
      requested_end_day: requestedEndDay,
      effective_end_day: endDay,
      fallback_days: fallbackDays,
      base_effective_end_day: baseEndDay,
      base_fallback_days: baseFallbackDays,
    });
  } catch (error) { res.status(424).json({ message: error.message }); }
};

const importVideoPerformanceExport = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const encodedFile = String(req.body?.file_base64 || '');
    const base64 = encodedFile.includes(',') ? encodedFile.slice(encodedFile.indexOf(',') + 1) : encodedFile;
    if (!base64 || base64.length > 14_000_000) {
      return res.status(400).json({ message: 'A video.xlsx file up to 10 MB is required.' });
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return res.status(400).json({ message: 'The uploaded file is not a valid XLSX workbook.' });
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const exportRecord = await importVideoPerformanceWorkbook(shop, buffer, {
      filename: req.body?.filename,
      startDate: datePattern.test(String(req.body?.start_date || '')) ? req.body.start_date : undefined,
      endDate: datePattern.test(String(req.body?.end_date || '')) ? req.body.end_date : undefined,
    });
    res.status(201).json({ export: exportRecord });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const syncVideoPerformanceApi = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const startDate = dateValue(req.body?.start_date);
    const endDate = dateValue(req.body?.end_date);
    if (!startDate || !endDate || startDate >= endDate) {
      return res.status(400).json({ message: 'A valid start_date and exclusive end_date are required.' });
    }
    const { exportRecord, started } = await startVideoPerformanceApiSync(shop, {
      startDate,
      endDate,
      currency: req.body?.currency === 'USD' ? 'USD' : 'LOCAL',
    });
    res.status(started ? 202 : 200).json({ export: exportRecord, started });
  } catch (error) {
    const permissionError = /grant data\.shop_analytics\.public\.read/i.test(error.message);
    res.status(permissionError ? 403 : 424).json({
      message: error.message,
      ...(error.tiktokCode !== undefined && error.tiktokCode !== null ? { tiktok_code: Number(error.tiktokCode) } : {}),
      ...(error.requestId ? { request_id: error.requestId } : {}),
    });
  }
};

const listVideoPerformanceApi = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const startDate = dateValue(req.query.start_date);
    const endDate = dateValue(req.query.end_date);
    if (!startDate || !endDate || startDate >= endDate) {
      return res.status(400).json({ message: 'A valid start_date and exclusive end_date are required.' });
    }
    const currency = req.query.currency === 'USD' ? 'USD' : 'LOCAL';
    const requestedExportId = req.query.export_id ? idValue(req.query.export_id) : null;
    if (req.query.export_id && !requestedExportId) {
      return res.status(400).json({ message: 'A valid export_id is required.' });
    }
    const exportRecord = await TikTokCreatorPerformanceExport.findOne({
      where: {
        shop_id: shop.id,
        module_type: VIDEO_API_MODULE_TYPE,
        start_date: startDate,
        end_date: endDate,
        window_type: currency === 'USD' ? 'API_USD' : 'API_LOCAL',
        ...(requestedExportId ? { id: requestedExportId } : {}),
      },
      order: [['created_at', 'DESC']],
    });
    if (!exportRecord) return res.json({ export: null, videos: [], total_count: 0, source: 'TIKTOK_SHOP_ANALYTICS_API' });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 50));
    const { count, rows } = exportRecord.status === 'SUCCEEDED'
      ? await TikTokVideoPerformanceSnapshot.findAndCountAll({
        where: { export_id: exportRecord.id },
        // Snapshot IDs follow the page-token order returned by TikTok. Keep that
        // source order so the report matches Affiliate Center instead of sorting
        // the rows again using a locally persisted metric.
        order: [['id', 'ASC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      : { count: 0, rows: [] };
    const videoValues = rows.map((row) => {
      const value = row.toJSON();
      delete value.refunds;
      delete value.items_refunded;
      return value;
    });
    const videoCreators = await hydrateCreatorRows(shop.id, videoValues.map((video) => {
      const source = video.raw_metrics?.list || {};
      const creator = source.creator || {};
      const linkedUsername = String(
        creator.user_name
          || creator.username
          || source.username
          || video.video_link?.match(/tiktok\.com\/@([^/]+)/i)?.[1]
          || '',
      ).trim().replace(/^@+/, '');
      return {
        username: linkedUsername,
        nickname: video.creator_name || creator.nick_name || creator.nickname || null,
      };
    }));
    const videos = videoValues.map((video, index) => ({
      ...video,
      creator_username: videoCreators[index]?.username || null,
      creator_avatar_url: videoCreators[index]?.avatar_url || null,
    }));
    res.json({
      export: exportRecord,
      videos,
      total_count: count,
      page,
      page_size: pageSize,
      source: 'TIKTOK_SHOP_ANALYTICS_API',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listVideoPerformanceExport = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const where = {
      shop_id: shop.id,
      module_type: 'VIDEO',
      ...(req.query.export_id ? { id: Number(req.query.export_id) } : {}),
    };
    const exportRecord = await TikTokCreatorPerformanceExport.findOne({
      where,
      order: [['created_at', 'DESC']],
    });
    if (!exportRecord) return res.json({ export: null, videos: [], total_count: 0 });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 50));
    const { count, rows } = exportRecord.status === 'SUCCEEDED'
      ? await TikTokVideoPerformanceSnapshot.findAndCountAll({
        where: { export_id: exportRecord.id },
        order: [['creator_attributed_gmv', 'DESC'], ['video_id', 'ASC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      : { count: 0, rows: [] };
    res.json({
      export: exportRecord,
      videos: rows.map((row) => row.toJSON()),
      total_count: count,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getExchangeRates = async (_req, res) => {
  try {
    res.json(await getMyrExchangeRates());
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

module.exports = {
  startShopOauth, handleShopOauthCallback, listShopConnections, listShops,
  getShopAnalytics, syncShopAnalytics, disconnectShopAuthorization, disconnectShop,
  listShopVideoPerformance, getShopVideoThumbnail,
  listOpenCollaborations, listTargetCollaborations, listAffiliateOrders, listAffiliateOrderStatistics, showOpenCollaborationSettings,
  listAffiliateCreators, showAffiliateCreatorFulfillments, listMarketplaceCreators, showMarketplaceCreator,
  createMarketplaceCreatorInvitation, addMarketplaceCreatorToInvitation,
  getMarketplaceCreatorConversation, sendMarketplaceCreatorMessage,
  listCreatorContentDetails,
  listCreatorPerformance,
  syncCreatorPerformance,
  syncVideoPerformanceApi,
  listVideoPerformanceApi,
  importVideoPerformanceExport,
  listVideoPerformanceExport,
  getExchangeRates,
};
