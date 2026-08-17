const XLSX = require('xlsx');
const { Op } = require('sequelize');
const {
  sequelize,
  TikTokCreatorPerformanceExport,
  TikTokCreatorPerformanceSnapshot,
  TikTokBasePerformanceSnapshot,
  TikTokApiCooldown,
} = require('../models');
const {
  createCompassExportTask,
  listCompassExportTasks,
  downloadCompassExportFile,
  searchSellerSampleApplications,
  searchMarketplaceCreators,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
} = require('./tiktokShopService');
const {
  loadCreatorProfiles: loadStoredCreatorProfiles,
  saveCreatorProfiles,
  hydrateCreatorRows,
} = require('./tiktokCreatorProfileService');
const {
  createMarketplaceRequestGate,
  runMarketplaceDiscoveryRequest,
} = require('./tiktokMarketplaceRequestGate');
const {
  beginCreatorProfileRefresh,
  endCreatorProfileRefresh,
} = require('./tiktokMarketplaceWorkCoordinator');

const WINDOW_DAYS = { PAST_24H: 1, PAST_7_DAYS: 7, PAST_30_DAYS: 30 };
const VALID_PLAN_TYPES = new Set(['ALL', 'TARGET', 'OPEN', 'PARTNER']);
const SUCCESS_STATUSES = new Set(['SUCCEEDED', 'SUCCESS', 'COMPLETED']);
const FAILED_STATUSES = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'EXPIRED']);
const REGION_CURRENCY = { MY: 'MYR', VN: 'VND', SG: 'SGD', TH: 'THB', PH: 'PHP', ID: 'IDR', US: 'USD', GB: 'GBP' };
const REGION_TIMEZONE = { MY: 'Asia/Kuala_Lumpur', VN: 'Asia/Ho_Chi_Minh', SG: 'Asia/Singapore', TH: 'Asia/Bangkok', PH: 'Asia/Manila', ID: 'Asia/Jakarta' };
const marketplaceProfileCooldowns = new Map();
const marketplaceShopCooldowns = new Map();
const creatorProfileRefreshRuns = new Map();
const MARKETPLACE_PROFILE_COOLDOWN_NAMESPACE = 'creator_marketplace_profile';
const COMPASS_COOLDOWN_NAMESPACE = 'creator_performance_compass';
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_CREATOR_PROFILE_TTL_MS = 24 * HOUR_MS;
const DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS = 2 * MINUTE_MS;
const DEFAULT_COMPASS_RATE_LIMIT_COOLDOWN_MS = 15 * MINUTE_MS;
const DEFAULT_COMPASS_RATE_LIMIT_MAX_COOLDOWN_MS = HOUR_MS;
const COMPASS_RATE_LIMIT_CODES = new Set([36009002, 36009037]);
const runCreatorProfileMarketplaceRequest = createMarketplaceRequestGate({
  // The profile worker itself waits two minutes. The shared Marketplace gate
  // leaves a one-minute slot for Discovery between profile requests.
  minIntervalMs: MINUTE_MS,
});

const configuredCreatorProfileTtlMs = () => {
  const value = Number(process.env.TIKTOK_CREATOR_PROFILE_TTL_MS ?? DEFAULT_CREATOR_PROFILE_TTL_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CREATOR_PROFILE_TTL_MS;
};

const configuredCreatorProfileRequestIntervalMs = () => {
  const value = Number(
    process.env.TIKTOK_CREATOR_PROFILE_REQUEST_INTERVAL_MS
      ?? process.env.TIKTOK_CREATOR_PROFILE_BATCH_DELAY_MS
      ?? DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
  );
  return Number.isFinite(value)
    ? Math.max(DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS, value)
    : DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS;
};

const configuredCreatorProfileRateLimitCooldownMs = () => {
  const value = Number(
    process.env.TIKTOK_CREATOR_PROFILE_RATE_LIMIT_COOLDOWN_MS
      ?? DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
  );
  return Number.isFinite(value)
    ? Math.max(DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS, value)
    : DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS;
};

const configuredCompassRateLimitCooldownMs = (consecutiveRateLimits = 1, retryAfterMs = 0) => {
  const configuredBase = Number(
    process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS
      ?? process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS
      ?? DEFAULT_COMPASS_RATE_LIMIT_COOLDOWN_MS,
  );
  const baseMs = Number.isFinite(configuredBase)
    ? Math.max(MINUTE_MS, configuredBase)
    : DEFAULT_COMPASS_RATE_LIMIT_COOLDOWN_MS;
  const configuredMax = Number(
    process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS
      ?? DEFAULT_COMPASS_RATE_LIMIT_MAX_COOLDOWN_MS,
  );
  const maxMs = Number.isFinite(configuredMax)
    ? Math.max(baseMs, configuredMax)
    : Math.max(baseMs, DEFAULT_COMPASS_RATE_LIMIT_MAX_COOLDOWN_MS);
  const streak = Math.max(1, Number(consecutiveRateLimits) || 1);
  const adaptiveMs = Math.min(maxMs, baseMs * (2 ** Math.min(20, streak - 1)));
  return Math.max(adaptiveMs, Math.max(0, Number(retryAfterMs) || 0));
};

const isCompassRateLimitError = (error) => COMPASS_RATE_LIMIT_CODES.has(Number(error?.tiktokCode))
  || /too many requests|rate limit|quota exceeded/i.test(String(error?.message || ''));

const loadCompassCooldownState = async (shopId, model = TikTokApiCooldown) => {
  const row = await model.findOne({
    where: { shop_id: shopId, namespace: COMPASS_COOLDOWN_NAMESPACE },
  });
  return {
    cooldownUntil: row?.cooldown_until ? new Date(row.cooldown_until).getTime() : 0,
    consecutiveRateLimits: Math.max(0, Number(row?.consecutive_rate_limits) || 0),
  };
};

const loadCompassCooldown = async (shopId, model = TikTokApiCooldown) => (
  (await loadCompassCooldownState(shopId, model)).cooldownUntil
);

const persistCompassCooldown = async (
  { shopId, cooldownUntil, reason, consecutiveRateLimits = 0 },
  model = TikTokApiCooldown,
) => {
  await model.upsert({
    shop_id: shopId,
    namespace: COMPASS_COOLDOWN_NAMESPACE,
    cooldown_until: new Date(cooldownUntil),
    consecutive_rate_limits: Math.max(0, Number(consecutiveRateLimits) || 0),
    reason: String(reason || '').slice(0, 2000) || null,
    updated_at: new Date(),
  });
};

const clearCompassRateLimitStreak = async (shopId, model = TikTokApiCooldown) => {
  await model.update({
    consecutive_rate_limits: 0,
    updated_at: new Date(),
  }, {
    where: { shop_id: shopId, namespace: COMPASS_COOLDOWN_NAMESPACE },
  });
};

const runCompassRequest = async (shop, operation, options = {}) => {
  const customLoadCooldown = typeof options.loadCooldown === 'function';
  const loadCooldownState = options.loadCooldownState || (customLoadCooldown
    ? async (shopId) => ({
      cooldownUntil: await options.loadCooldown(shopId),
      consecutiveRateLimits: 0,
    })
    : loadCompassCooldownState);
  const persistCooldown = options.persistCooldown || persistCompassCooldown;
  const clearCooldownStreak = options.clearCooldownStreak || clearCompassRateLimitStreak;
  const now = options.now || (() => Date.now());
  const logger = options.logger || console;
  const state = await loadCooldownState(shop.id);
  const cooldownUntil = Number(state?.cooldownUntil) || 0;
  if (cooldownUntil > now()) {
    const error = new Error(`TikTok Compass is cooling down until ${new Date(cooldownUntil).toISOString()}.`);
    error.code = 'TIKTOK_COMPASS_COOLDOWN';
    error.cooldownUntil = cooldownUntil;
    error.retryAfterMs = cooldownUntil - now();
    error.consecutiveRateLimits = Math.max(0, Number(state?.consecutiveRateLimits) || 0);
    throw error;
  }

  try {
    const result = await operation();
    if (Number(state?.consecutiveRateLimits) > 0) {
      await clearCooldownStreak(shop.id).catch((clearError) => {
        logger?.warn?.('[Creator Performance] Could not clear Compass rate-limit streak', {
          shopId: shop.id,
          message: clearError.message,
        });
      });
    }
    return result;
  } catch (error) {
    if (isCompassRateLimitError(error)) {
      const consecutiveRateLimits = Math.max(0, Number(state?.consecutiveRateLimits) || 0) + 1;
      const cooldownMs = options.cooldownMs === undefined
        ? configuredCompassRateLimitCooldownMs(consecutiveRateLimits, error.retryAfterMs)
        : Math.max(Number(options.cooldownMs) || 0, Number(error.retryAfterMs) || 0);
      const nextAttemptAt = now() + cooldownMs;
      error.cooldownUntil = nextAttemptAt;
      error.cooldownMs = cooldownMs;
      error.consecutiveRateLimits = consecutiveRateLimits;
      await persistCooldown({
        shopId: shop.id,
        cooldownUntil: nextAttemptAt,
        reason: error.message,
        consecutiveRateLimits,
      }).catch((persistError) => {
        logger?.warn?.('[Creator Performance] Could not persist Compass cooldown', {
          shopId: shop.id,
          message: persistError.message,
        });
      });
    }
    throw error;
  }
};

const loadPersistedMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  const row = await model.findOne({
    where: { shop_id: shopId, namespace: MARKETPLACE_PROFILE_COOLDOWN_NAMESPACE },
  });
  if (!row?.cooldown_until) return 0;
  const persistedUntil = new Date(row.cooldown_until).getTime();
  if (!row.updated_at) return persistedUntil;
  const updatedAt = new Date(row.updated_at || 0).getTime();
  if (!Number.isFinite(updatedAt)) return persistedUntil;
  return Math.min(
    persistedUntil,
    updatedAt + configuredCreatorProfileRateLimitCooldownMs(),
  );
};

const persistMarketplaceCooldown = async ({ shopId, cooldownUntil, reason }, model = TikTokApiCooldown) => {
  await model.upsert({
    shop_id: shopId,
    namespace: MARKETPLACE_PROFILE_COOLDOWN_NAMESPACE,
    cooldown_until: new Date(cooldownUntil),
    reason: String(reason || '').slice(0, 2000) || null,
    updated_at: new Date(),
  });
};

const prepareMarketplaceOptions = async (shop, searchMarketplace, options = {}) => {
  if (searchMarketplace !== searchMarketplaceCreators) return { coolingDown: false, options };
  const cooldownUntil = await loadPersistedMarketplaceCooldown(shop.id).catch(() => 0);
  if (cooldownUntil > Date.now()) return { coolingDown: true, cooldownUntil, options };
  return {
    coolingDown: false,
    options: {
      ...options,
      onRateLimit: async (details) => {
        await options.onRateLimit?.(details);
        await persistMarketplaceCooldown(details).catch((error) => {
          console.warn('[Creator Performance] Could not persist Marketplace cooldown', {
            shopId: shop.id,
            message: error.message,
          });
        });
      },
    },
  };
};

const isoFromEndDay = (endDay) => {
  const value = String(endDay || '');
  if (!/^\d{8}$/.test(value)) throw new Error('end_day must use YYYYMMDD format.');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('end_day is invalid.');
  return iso;
};

const exportDateRange = (windowType, endDay) => {
  const days = WINDOW_DAYS[windowType];
  if (!days) throw new Error('window_type must be PAST_24H, PAST_7_DAYS, or PAST_30_DAYS.');
  const endDate = isoFromEndDay(endDay);
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate };
};

const yesterdayEndDay = (region = 'MY', now = new Date()) => {
  const timezone = REGION_TIMEZONE[String(region || '').toUpperCase()] || 'UTC';
  const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const local = new Date(`${localParts.year}-${localParts.month}-${localParts.day}T00:00:00.000Z`);
  local.setUTCDate(local.getUTCDate() - 1);
  return Number(local.toISOString().slice(0, 10).replaceAll('-', ''));
};

const shiftEndDay = (endDay, days) => {
  const iso = isoFromEndDay(endDay);
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return Number(date.toISOString().slice(0, 10).replaceAll('-', ''));
};

const numeric = (value) => {
  if (value === null || value === undefined || value === '' || value === '--') return 0;
  const normalized = String(value).replaceAll(',', '').replace(/[^\d.-]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumeric = (value) => (value === '--' || value === '' || value === null || value === undefined ? null : numeric(value));
const integer = (value) => Math.round(numeric(value));
const nullableInteger = (value) => {
  const parsed = nullableNumeric(value);
  return parsed === null ? null : Math.round(parsed);
};
const normalizeUsername = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();
const avatarUrlExpired = (value, now = Date.now()) => {
  try {
    const expiresAt = Number(new URL(String(value || '')).searchParams.get('x-expires'));
    return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt * 1000 <= now;
  } catch {
    return false;
  }
};

const parseCreatorPerformanceWorkbook = (buffer, {
  exportId, shopId, startDate, endDate, windowType, planType, currency,
}) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('TikTok Compass workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.filter((row) => String(row['Creator username'] || row['Creator name'] || '').trim()).map((row) => ({
    export_id: exportId,
    shop_id: shopId,
    username: String(row['Creator username'] || row['Creator name']).trim().replace(/^@/, ''),
    nickname: null,
    avatar_url: null,
    creator_open_id: null,
    start_date: startDate,
    end_date: endDate,
    window_type: windowType,
    plan_type: planType,
    currency,
    affiliate_gmv: numeric(row['Affiliate GMV'] ?? row['Creator-attributed GMV']),
    live_gmv: numeric(row['Affiliate LIVE GMV'] ?? row['Creator LIVE-attributed GMV']),
    video_gmv: numeric(row['Affiliate shoppable video GMV'] ?? row['Creator video-attributed GMV']),
    product_card_gmv: numeric(row['Affiliate product card GMV'] ?? row['Affiliate product card-attributed GMV']),
    affiliate_products_sold: integer(row['Affiliate products sold'] ?? row['Products sold']),
    products_sold: integer(row['Products sold'] ?? row['Affiliate products sold']),
    items_sold: integer(row['Items sold'] ?? row['Creator-attributed items sold']),
    estimated_commission: numeric(row['Est. commission']),
    estimated_flat_fee: nullableNumeric(row['Est. flat fee']),
    average_order_value: numeric(row['Avg. order value'] ?? row.AOV),
    product_showcase_count: integer(row['Affiliate product showcase'] ?? row['Products added to showcase']),
    products_added_to_showcase: integer(row['Products added to showcase'] ?? row['Affiliate product showcase']),
    total_sample_content: integer(row['Total sample content']),
    samples_shipped: integer(row['Samples shipped']),
    affiliate_orders: integer(row['Affiliate orders'] ?? row['Attributed orders']),
    ctr: numeric(row.CTR) / 100,
    ctor: numeric(row.CTOR) / 100,
    product_impressions: integer(row['Product impressions']),
    average_affiliate_customers: numeric(row['Avg. affiliate customers'] ?? row.Customers),
    customers: integer(row.Customers ?? row['Avg. affiliate customers']),
    video_views: nullableInteger(row['Video views']),
    live_streams: integer(row['Affiliate LIVE streams'] ?? row['LIVE streams']),
    shoppable_videos: integer(row['Affiliate shoppable videos'] ?? row.Videos),
    target_gmv: numeric(row['Target collaboration GMV']),
    target_estimated_commission: numeric(row['Target collaboration est. commission']),
    open_gmv: numeric(row['Open collaboration GMV']),
    open_estimated_commission: numeric(row['Open collaboration est. commission']),
    refunded_gmv: numeric(row['Affiliate refunded GMV'] ?? row.Refunds),
    items_refunded: integer(row['Affiliate items refunded'] ?? row['Items refunded']),
    followers: integer(row['Affiliate followers']),
    raw_metrics: row,
    synced_at: new Date(),
  }));
};

const parseBasePerformanceWorkbook = (buffer, {
  exportId, shopId, startDate, endDate, windowType, currency,
}) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('TikTok Compass BASE workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const moneyPattern = /^\s*(?:[A-Z]{2,3}|RM|[$€£¥₫])?\s*-?[\d,.]+\s*$/u;
  const row = rows.find((item) => moneyPattern.test(String(item['Creator-attributed GMV'] || '')));
  if (!row) throw new Error('TikTok Compass BASE workbook does not contain a metrics row.');
  return {
    export_id: exportId,
    shop_id: shopId,
    start_date: startDate,
    end_date: endDate,
    window_type: windowType,
    currency,
    creator_attributed_gmv: numeric(row['Creator-attributed GMV']),
    creator_attributed_items_sold: integer(row['Creator-attributed items sold']),
    refunds: numeric(row.Refunds),
    estimated_commission: numeric(row['Est. commission']),
    videos: integer(row.Videos),
    live_streams: integer(row['LIVE streams']),
    samples_shipped: integer(row['Samples shipped']),
    items_refunded: integer(row['Items refunded']),
    average_order_value: numeric(row.AOV),
    raw_metrics: row,
    synced_at: new Date(),
  };
};

const taskRows = (payload) => payload?.data?.tasks
  || payload?.data?.offline_tasks
  || payload?.data?.task_list
  || [];

const findTask = (payload, taskId) => taskRows(payload).find(
  (task) => String(task.id || task.task_id) === String(taskId),
);

const normalizeCreatorProfile = (creator = {}) => ({
  username: String(creator.username || '').trim().replace(/^@/, ''),
  nickname: creator.nickname || null,
  avatar_url: creator.avatar_url || creator.avatar?.url || null,
  follower_count: Number(creator.follower_count) || 0,
  creator_open_id: creator.creator_open_id || creator.creator_user_open_id || creator.user_id || null,
});

const creatorRowHasFetchedProfile = (row = {}) => Boolean(
  row.nickname || row.avatar_url || row.creator_open_id,
);

const loadCreatorProfiles = async (shop, searchSamples = searchSellerSampleApplications) => {
  const profiles = new Map();
  let pageToken;
  for (let page = 0; page < 20; page += 1) {
    const payload = await searchSamples({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      pageSize: 50,
      pageToken,
    });
    for (const application of payload.data?.sample_applications || []) {
      const creator = normalizeCreatorProfile(application.creator);
      const username = normalizeUsername(creator.username);
      if (username && !profiles.has(username)) profiles.set(username, creator);
    }
    pageToken = payload.data?.next_page_token;
    if (!pageToken) break;
  }
  return profiles;
};

const loadMarketplaceCreatorProfiles = async (
  shop,
  usernames,
  searchMarketplace = searchMarketplaceCreators,
  {
    concurrency = Number(process.env.TIKTOK_CREATOR_PROFILE_CONCURRENCY || 1),
    minIntervalMs = Number(process.env.TIKTOK_CREATOR_PROFILE_MIN_INTERVAL_MS || 2500),
    retryCount = Number(process.env.TIKTOK_CREATOR_PROFILE_RETRY_COUNT || 3),
    rateLimitCooldownMs = configuredCreatorProfileRateLimitCooldownMs(),
    cooldowns = marketplaceProfileCooldowns,
    shopCooldowns = marketplaceShopCooldowns,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRateLimit = async () => {},
    requestGate,
  } = {},
) => {
  const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
  if (!scopes.includes(SELLER_CREATOR_MARKETPLACE_SCOPE)) return new Map();
  const queue = [...new Set(usernames.map(normalizeUsername).filter(Boolean))];
  const profiles = new Map();
  const workerCount = Math.min(queue.length, Math.max(1, Math.min(10, Number(concurrency) || 1)));
  const requestInterval = Math.max(0, Number(minIntervalMs) || 0);
  const retries = Math.max(0, Math.min(8, Number(retryCount) || 0));
  const cooldownMs = Math.max(0, Number(rateLimitCooldownMs) || 0);
  const runRequest = requestGate || (searchMarketplace === searchMarketplaceCreators
    ? runMarketplaceDiscoveryRequest
    : async (_shopId, operation) => operation());
  let nextIndex = 0;
  let nextRequestAt = 0;
  let stopAllRequests = false;
  const cooldownKey = (username) => `${shop.id}:${username}`;
  const shopCooldownKey = String(shop.id);
  const isCoolingDown = (username) => {
    const key = cooldownKey(username);
    const expiresAt = Number(cooldowns.get(key) || 0);
    if (!expiresAt) return false;
    if (expiresAt <= now()) {
      cooldowns.delete(key);
      return false;
    }
    return true;
  };
  const isShopCoolingDown = () => {
    const expiresAt = Number(shopCooldowns.get(shopCooldownKey) || 0);
    if (!expiresAt) return false;
    if (expiresAt <= now()) {
      shopCooldowns.delete(shopCooldownKey);
      return false;
    }
    return true;
  };
  const setCooldown = (username) => {
    if (!cooldownMs) return;
    cooldowns.set(cooldownKey(username), now() + cooldownMs);
  };
  const setShopCooldown = () => {
    if (!cooldownMs) return;
    shopCooldowns.set(shopCooldownKey, now() + cooldownMs);
  };
  if (isShopCoolingDown()) return new Map();
  const waitForRequestSlot = async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextRequestAt);
    nextRequestAt = scheduledAt + requestInterval;
    if (scheduledAt > now) await sleep(scheduledAt - now);
  };
  const worker = async () => {
    while (nextIndex < queue.length && !stopAllRequests) {
      const username = queue[nextIndex];
      nextIndex += 1;
      if (stopAllRequests || isShopCoolingDown() || isCoolingDown(username)) continue;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          if (stopAllRequests || isShopCoolingDown()) break;
          await waitForRequestSlot();
          if (stopAllRequests || isShopCoolingDown()) break;
          const payload = await runRequest(shop.id, () => searchMarketplace({
            authorization: shop.authorization,
            shopCipher: shop.cipher,
            pageSize: 20,
            keyword: username,
          }));
          const creators = payload.data?.creators || [];
          const exactMatch = creators.find((creator) => normalizeUsername(creator.username) === username);
          if (exactMatch) profiles.set(username, normalizeCreatorProfile(exactMatch));
          break;
        } catch (error) {
          const rateLimited = [36009002, 36009037].includes(Number(error.tiktokCode));
          if (rateLimited) {
            const cooldownUntil = now() + cooldownMs;
            setCooldown(username);
            setShopCooldown();
            stopAllRequests = true;
            await onRateLimit({
              shopId: shop.id,
              username,
              cooldownUntil,
              reason: error.message,
              code: Number(error.tiktokCode),
            });
            console.warn('[Creator Performance] Marketplace profile lookup rate-limited', {
              shopId: shop.id,
              username,
              attempt: attempt + 1,
              cooldownMs,
              message: error.message,
            });
            break;
          }
          if (attempt < retries) {
            await sleep(Math.min(60000, 5000 * (2 ** attempt)));
            continue;
          }
          console.warn('[Creator Performance] Marketplace profile lookup failed', {
            shopId: shop.id,
            username,
            attempt: attempt + 1,
            message: error.message,
          });
          break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return profiles;
};

const applyCreatorProfile = (row, profile) => {
  if (!profile) return;
  row.nickname = profile.nickname || row.nickname || null;
  row.avatar_url = profile.avatar_url || row.avatar_url || null;
  row.creator_open_id = profile.creator_open_id || row.creator_open_id || null;
  if (!row.followers) row.followers = Number(profile.follower_count) || 0;
};

const creatorProfileNeedsRefresh = (row) => !row.avatar_url
  || avatarUrlExpired(row.avatar_url);

const creatorProfileTtlExpired = (profile, {
  now = Date.now(),
  ttlMs = configuredCreatorProfileTtlMs(),
} = {}) => {
  if (!profile) return true;
  const refreshedAt = new Date(profile.refreshed_at || 0).getTime();
  const currentTime = typeof now === 'function' ? Number(now()) : Number(now);
  const normalizedTtl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) >= 0
    ? Number(ttlMs)
    : DEFAULT_CREATOR_PROFILE_TTL_MS;
  return !Number.isFinite(refreshedAt)
    || !Number.isFinite(currentTime)
    || refreshedAt <= currentTime - normalizedTtl;
};

const selectCreatorProfileRefreshCandidates = (rows, storedProfiles, options = {}) => rows.filter((row) => {
  const storedProfile = storedProfiles.get(`username:${normalizeUsername(row.username)}`);
  const effectiveProfile = {
    ...row,
    avatar_url: storedProfile?.avatar_url || row.avatar_url,
  };
  return creatorProfileNeedsRefresh(effectiveProfile) || creatorProfileTtlExpired(storedProfile, options);
});

const enrichCreatorRows = async (shop, rows, {
  searchSamples = searchSellerSampleApplications,
  searchMarketplace = searchMarketplaceCreators,
  marketplaceEnabled = true,
  refreshMarketplace = false,
  marketplaceOptions,
} = {}) => {
  const sampleProfiles = await loadCreatorProfiles(shop, searchSamples).catch(() => new Map());
  for (const row of rows) applyCreatorProfile(row, sampleProfiles.get(normalizeUsername(row.username)));
  if (!marketplaceEnabled) return rows;
  const missingUsernames = rows
    .filter((row) => creatorProfileNeedsRefresh(row)
      && (!row.avatar_url || Number(row.followers) <= 0 || refreshMarketplace))
    .map((row) => row.username);
  const preparedMarketplace = await prepareMarketplaceOptions(shop, searchMarketplace, marketplaceOptions);
  if (preparedMarketplace.coolingDown) return rows;
  const marketplaceProfiles = await loadMarketplaceCreatorProfiles(
    shop,
    missingUsernames,
    searchMarketplace,
    preparedMarketplace.options,
  );
  for (const row of rows) applyCreatorProfile(row, marketplaceProfiles.get(normalizeUsername(row.username)));
  return rows;
};

const runCreatorPerformanceProfileRefresh = async (shop, exportRecord, dependencies = {}) => {
  const {
    searchMarketplace = searchMarketplaceCreators,
    marketplaceOptions,
    profileTtlMs = configuredCreatorProfileTtlMs(),
    requestIntervalMs = configuredCreatorProfileRequestIntervalMs(),
    profileRequestGate,
    SnapshotModel = TikTokCreatorPerformanceSnapshot,
    loadStoredProfiles = loadStoredCreatorProfiles,
    saveProfiles = saveCreatorProfiles,
    hydrateProfiles = hydrateCreatorRows,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = console,
  } = dependencies;
  const normalizedRequestIntervalMs = Math.max(
    DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
    Number(requestIntervalMs) || DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
  );
  const effectiveProfileRequestGate = profileRequestGate
    || (searchMarketplace === searchMarketplaceCreators
      ? runCreatorProfileMarketplaceRequest
      : async (_shopId, operation) => operation());
  const currentTimestamp = () => {
    const value = typeof now === 'function' ? Number(now()) : Number(now);
    return Number.isFinite(value) ? value : Date.now();
  };
  const startedAt = Date.now();
  logger?.info?.('[Creator Profile Refresh] Started', {
    shopId: shop.id,
    exportId: exportRecord.id,
    taskId: exportRecord.task_id,
    startDate: exportRecord.start_date,
    endDate: exportRecord.end_date,
    planType: exportRecord.plan_type,
    profileTtlMs,
    requestIntervalMs: normalizedRequestIntervalMs,
  });
  const snapshots = await SnapshotModel.findAll({
    where: {
      shop_id: shop.id,
      start_date: exportRecord.start_date,
      end_date: exportRecord.end_date,
      plan_type: exportRecord.plan_type,
    },
  });
  if (!snapshots.length) {
    logger?.info?.('[Creator Profile Refresh] Completed', {
      shopId: shop.id,
      exportId: exportRecord.id,
      snapshotCount: 0,
      refreshedCount: 0,
      durationMs: Date.now() - startedAt,
    });
    return 0;
  }
  const rows = snapshots.map((snapshot) => snapshot.toJSON());
  const persistRows = async (profileRows) => {
    if (!profileRows.length) return;
    await saveProfiles(shop.id, profileRows, 'performance', { logger });
    const sharedRows = await hydrateProfiles(shop.id, profileRows);
    await SnapshotModel.bulkCreate(sharedRows, {
      conflictAttributes: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'],
      updateOnDuplicate: ['nickname', 'avatar_url', 'creator_open_id', 'followers'],
    });
  };
  const refreshed = new Set();
  const storedProfiles = await loadStoredProfiles(shop.id, rows);
  const currentTime = currentTimestamp();
  const candidates = selectCreatorProfileRefreshCandidates(rows, storedProfiles, {
    now: currentTime,
    ttlMs: profileTtlMs,
  });
  logger?.info?.('[Creator Profile Refresh] Marketplace candidates selected', {
    shopId: shop.id,
    exportId: exportRecord.id,
    candidateCount: candidates.length,
    requestsPerRun: candidates.length,
    requestIntervalMs: normalizedRequestIntervalMs,
  });
  let index = 0;
  while (index < candidates.length) {
    const preparedMarketplace = await prepareMarketplaceOptions(shop, searchMarketplace, marketplaceOptions);
    const requestNumber = index + 1;
    if (preparedMarketplace.coolingDown) {
      const retryInMs = Math.max(1000, Number(preparedMarketplace.cooldownUntil) - currentTimestamp());
      logger?.warn?.('[Creator Profile Refresh] Waiting for Marketplace rate-limit cooldown', {
        shopId: shop.id,
        exportId: exportRecord.id,
        requestNumber,
        totalRequests: candidates.length,
        cooldownUntil: new Date(preparedMarketplace.cooldownUntil).toISOString(),
        retryInMs,
      });
      await sleep(retryInMs);
      continue;
    }
    const row = candidates[index];
    logger?.info?.('[Creator Profile Refresh] Marketplace request started', {
      shopId: shop.id,
      exportId: exportRecord.id,
      requestNumber,
      totalRequests: candidates.length,
      username: row.username,
    });
    const profiles = await loadMarketplaceCreatorProfiles(
      shop,
      [row.username],
      searchMarketplace,
      {
        ...preparedMarketplace.options,
        concurrency: 1,
        minIntervalMs: normalizedRequestIntervalMs,
        rateLimitCooldownMs: normalizedRequestIntervalMs,
        now: preparedMarketplace.options.now || now,
        sleep: preparedMarketplace.options.sleep || sleep,
        requestGate: preparedMarketplace.options.requestGate || effectiveProfileRequestGate,
      },
    );
    const profile = profiles.get(normalizeUsername(row.username));
    if (profile) {
      applyCreatorProfile(row, profile);
      refreshed.add(normalizeUsername(row.username));
      await persistRows([row]);
    }
    const activeShopCooldowns = preparedMarketplace.options.shopCooldowns || marketplaceShopCooldowns;
    const cooldownUntil = Number(activeShopCooldowns.get(String(shop.id)) || 0);
    if (cooldownUntil > currentTimestamp()) {
      const retryInMs = Math.max(1000, cooldownUntil - currentTimestamp());
      logger?.warn?.('[Creator Profile Refresh] Rate-limited; retrying the same creator', {
        shopId: shop.id,
        exportId: exportRecord.id,
        requestNumber,
        username: row.username,
        cooldownUntil: new Date(cooldownUntil).toISOString(),
        retryInMs,
      });
      await sleep(retryInMs);
      continue;
    }
    logger?.info?.('[Creator Profile Refresh] Marketplace request completed', {
      shopId: shop.id,
      exportId: exportRecord.id,
      requestNumber,
      totalRequests: candidates.length,
      username: row.username,
      matched: Boolean(profile),
    });
    index += 1;
    if (index < candidates.length) {
      logger?.info?.('[Creator Profile Refresh] Waiting before next request', {
        shopId: shop.id,
        exportId: exportRecord.id,
        nextRequestNumber: index + 1,
        delayMs: normalizedRequestIntervalMs,
      });
      await sleep(normalizedRequestIntervalMs);
    }
  }
  logger?.info?.('[Creator Profile Refresh] Completed', {
    shopId: shop.id,
    exportId: exportRecord.id,
    candidateCount: candidates.length,
    refreshedCount: refreshed.size,
    durationMs: Date.now() - startedAt,
  });
  return refreshed.size;
};

const refreshCreatorPerformanceProfiles = (shop, exportRecord, dependencies = {}) => {
  const shopKey = String(shop.id);
  const existingRun = creatorProfileRefreshRuns.get(shopKey);
  if (existingRun) return existingRun;
  const run = (async () => {
    beginCreatorProfileRefresh(shop.id);
    try {
      return await runCreatorPerformanceProfileRefresh(shop, exportRecord, dependencies);
    } finally {
      endCreatorProfileRefresh(shop.id);
    }
  })();
  const trackedRun = run.finally(() => {
    if (creatorProfileRefreshRuns.get(shopKey) === trackedRun) creatorProfileRefreshRuns.delete(shopKey);
  });
  creatorProfileRefreshRuns.set(shopKey, trackedRun);
  return trackedRun;
};

const createCreatorPerformanceExport = async (shop, {
  windowType = 'PAST_7_DAYS', endDay = yesterdayEndDay(shop.region), planType = 'ALL',
} = {}, dependencies = {}) => {
  const normalizedWindow = String(windowType).toUpperCase();
  const normalizedPlan = String(planType).toUpperCase();
  if (!VALID_PLAN_TYPES.has(normalizedPlan)) throw new Error('plan_type must be ALL, TARGET, OPEN, or PARTNER.');
  const { startDate, endDate } = exportDateRange(normalizedWindow, endDay);
  const existing = await TikTokCreatorPerformanceExport.findOne({
    where: {
      shop_id: shop.id,
      module_type: 'CREATOR',
      window_type: normalizedWindow,
      plan_type: normalizedPlan,
      start_date: startDate,
      end_date: endDate,
      status: { [Op.in]: ['PROCESSING', 'SUCCEEDED'] },
    },
    order: [['created_at', 'DESC']],
  });
  if (existing) return existing;
  const payload = await runCompassRequest(shop, () => (
    dependencies.createTask || createCompassExportTask
  )({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    windowType: normalizedWindow,
    endDay,
    planType: normalizedPlan,
  }), dependencies);
  const taskId = payload.data?.task?.id || payload.data?.task_id;
  if (!taskId) throw new Error('TikTok Compass did not return a task id.');
  return TikTokCreatorPerformanceExport.create({
    shop_id: shop.id,
    task_id: String(taskId),
    module_type: 'CREATOR',
    window_type: normalizedWindow,
    plan_type: normalizedPlan,
    start_date: startDate,
    end_date: endDate,
    status: 'PROCESSING',
    request_id: payload.request_id || null,
  });
};

const createBasePerformanceExport = async (shop, {
  windowType = 'PAST_7_DAYS', endDay = yesterdayEndDay(shop.region),
} = {}, dependencies = {}) => {
  const normalizedWindow = String(windowType).toUpperCase();
  const { startDate, endDate } = exportDateRange(normalizedWindow, endDay);
  const existing = await TikTokCreatorPerformanceExport.findOne({
    where: {
      shop_id: shop.id,
      module_type: 'BASE',
      window_type: normalizedWindow,
      start_date: startDate,
      end_date: endDate,
      status: { [Op.in]: ['PROCESSING', 'SUCCEEDED'] },
    },
    order: [['created_at', 'DESC']],
  });
  if (existing) return existing;
  const payload = await runCompassRequest(shop, () => (
    dependencies.createTask || createCompassExportTask
  )({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    moduleType: 'BASE',
    windowType: normalizedWindow,
    endDay,
  }), dependencies);
  const taskId = payload.data?.task?.id || payload.data?.task_id;
  if (!taskId) throw new Error('TikTok Compass did not return a BASE task id.');
  return TikTokCreatorPerformanceExport.create({
    shop_id: shop.id,
    task_id: String(taskId),
    module_type: 'BASE',
    window_type: normalizedWindow,
    plan_type: 'ALL',
    start_date: startDate,
    end_date: endDate,
    status: 'PROCESSING',
    request_id: payload.request_id || null,
  });
};

const createCreatorPerformanceExportWithFallback = async (shop, options = {}, {
  maxFallbackDays = 7,
  fallbackDelayMs = 2000,
  createExport = createCreatorPerformanceExport,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
} = {}) => {
  const requestedEndDay = Number(options.endDay || yesterdayEndDay(shop.region));
  let endDay = requestedEndDay;
  let lastError;

  for (let fallbackDays = 0; fallbackDays <= maxFallbackDays; fallbackDays += 1) {
    try {
      const exportRecord = await createExport(shop, { ...options, endDay });
      return { exportRecord, requestedEndDay, endDay, fallbackDays };
    } catch (error) {
      lastError = error;
      if (isCompassRateLimitError(error) || error.code === 'TIKTOK_COMPASS_COOLDOWN') throw error;
      if (Number(error.tiktokCode) !== 13017003 || fallbackDays === maxFallbackDays) throw error;

      logger?.warn?.('[Creator Performance] End day unavailable; falling back to previous day', {
        shopId: shop.id,
        currentEndDay: endDay,
        nextEndDay: shiftEndDay(endDay, -1),
        fallbackDays: fallbackDays + 1,
        reason: error.message,
      });

      if (fallbackDelayMs > 0) {
        await sleep(fallbackDelayMs);
      }
      endDay = shiftEndDay(endDay, -1);
    }
  }

  throw lastError || new Error('TikTok Compass export date is not available.');
};

const createBasePerformanceExportWithFallback = (shop, options = {}, dependencies = {}) => (
  createCreatorPerformanceExportWithFallback(shop, options, {
    ...dependencies,
    createExport: dependencies.createExport || createBasePerformanceExport,
  })
);

const processCreatorPerformanceExport = async (shop, exportRecord, {
  pollIntervalMs = 5000, timeoutMs = 15 * 60 * 1000, listTasks = listCompassExportTasks,
  downloadFile = downloadCompassExportFile, searchSamples = searchSellerSampleApplications,
  searchMarketplace = searchMarketplaceCreators,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) => {
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const payload = await runCompassRequest(shop, () => listTasks({
        authorization: shop.authorization, shopCipher: shop.cipher, pageSize: 100,
      }));
      const task = findTask(payload, exportRecord.task_id);
      const status = String(task?.status || task?.task_status || '').toUpperCase();
      if (FAILED_STATUSES.has(status)) throw new Error(task?.fail_reason || task?.error_message || `TikTok Compass task ${status}.`);
      if (SUCCESS_STATUSES.has(status)) {
        const filePayload = await runCompassRequest(shop, () => downloadFile({
          authorization: shop.authorization, shopCipher: shop.cipher, taskId: exportRecord.task_id,
        }));
        const base64 = filePayload.data?.file?.base64 || filePayload.data?.base64;
        if (!base64) throw new Error('TikTok Compass did not return the XLSX file.');
        const rows = parseCreatorPerformanceWorkbook(Buffer.from(base64, 'base64'), {
          exportId: exportRecord.id,
          shopId: shop.id,
          startDate: exportRecord.start_date,
          endDate: exportRecord.end_date,
          windowType: exportRecord.window_type,
          planType: exportRecord.plan_type,
          currency: REGION_CURRENCY[String(shop.region || '').toUpperCase()] || 'USD',
        });
        // Performance is cache-first. Export processing may reuse profile data
        // from Sample Applications, while Marketplace Discovery updates the
        // shared cache independently without per-username background lookups.
        await enrichCreatorRows(shop, rows, {
          searchSamples,
          searchMarketplace,
          marketplaceEnabled: false,
        });
        await saveCreatorProfiles(shop.id, rows.filter(creatorRowHasFetchedProfile), 'performance');
        const sharedRows = await hydrateCreatorRows(shop.id, rows);
        rows.splice(0, rows.length, ...sharedRows);
        await sequelize.transaction(async (transaction) => {
          if (rows.length) {
            await TikTokCreatorPerformanceSnapshot.bulkCreate(rows, {
              transaction,
              conflictAttributes: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'],
              updateOnDuplicate: Object.keys(rows[0]).filter((key) => !['id', 'shop_id', 'username', 'start_date', 'end_date', 'plan_type'].includes(key)),
            });
          }
          await exportRecord.update({
            status: 'SUCCEEDED', row_count: rows.length, completed_at: new Date(), error: null,
          }, { transaction });
        });
        return exportRecord.reload();
      }
      await sleep(pollIntervalMs);
    }
    throw new Error('TikTok Compass report timed out after 15 minutes.');
  } catch (error) {
    await exportRecord.update({ status: 'FAILED', error: String(error.message).slice(0, 2000), completed_at: new Date() });
    throw error;
  }
};

const processBasePerformanceExport = async (shop, exportRecord, {
  pollIntervalMs = 5000,
  timeoutMs = 15 * 60 * 1000,
  listTasks = listCompassExportTasks,
  downloadFile = downloadCompassExportFile,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) => {
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const payload = await runCompassRequest(shop, () => listTasks({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        docType: 'BASE',
        pageSize: 100,
      }));
      const task = findTask(payload, exportRecord.task_id);
      const status = String(task?.status || task?.task_status || '').toUpperCase();
      if (FAILED_STATUSES.has(status)) throw new Error(task?.fail_reason || task?.error_message || `TikTok Compass BASE task ${status}.`);
      if (SUCCESS_STATUSES.has(status)) {
        const filePayload = await runCompassRequest(shop, () => downloadFile({
          authorization: shop.authorization,
          shopCipher: shop.cipher,
          taskId: exportRecord.task_id,
        }));
        const base64 = filePayload.data?.file?.base64 || filePayload.data?.base64;
        if (!base64) throw new Error('TikTok Compass did not return the BASE XLSX file.');
        const snapshot = parseBasePerformanceWorkbook(Buffer.from(base64, 'base64'), {
          exportId: exportRecord.id,
          shopId: shop.id,
          startDate: exportRecord.start_date,
          endDate: exportRecord.end_date,
          windowType: exportRecord.window_type,
          currency: REGION_CURRENCY[String(shop.region || '').toUpperCase()] || 'USD',
        });
        await sequelize.transaction(async (transaction) => {
          await TikTokBasePerformanceSnapshot.upsert(snapshot, { transaction });
          await exportRecord.update({
            status: 'SUCCEEDED', row_count: 1, completed_at: new Date(), error: null,
          }, { transaction });
        });
        return exportRecord.reload();
      }
      await sleep(pollIntervalMs);
    }
    throw new Error('TikTok Compass BASE report timed out after 15 minutes.');
  } catch (error) {
    await exportRecord.update({ status: 'FAILED', error: String(error.message).slice(0, 2000), completed_at: new Date() });
    throw error;
  }
};

module.exports = {
  WINDOW_DAYS,
  exportDateRange,
  yesterdayEndDay,
  shiftEndDay,
  parseCreatorPerformanceWorkbook,
  parseBasePerformanceWorkbook,
  createCreatorPerformanceExport,
  createBasePerformanceExport,
  createCreatorPerformanceExportWithFallback,
  createBasePerformanceExportWithFallback,
  processCreatorPerformanceExport,
  processBasePerformanceExport,
  isCompassRateLimitError,
  COMPASS_COOLDOWN_NAMESPACE,
  configuredCompassRateLimitCooldownMs,
  loadCompassCooldown,
  loadCompassCooldownState,
  persistCompassCooldown,
  clearCompassRateLimitStreak,
  runCompassRequest,
  loadCreatorProfiles,
  loadMarketplaceCreatorProfiles,
  loadPersistedMarketplaceCooldown,
  persistMarketplaceCooldown,
  creatorRowHasFetchedProfile,
  creatorProfileNeedsRefresh,
  creatorProfileTtlExpired,
  selectCreatorProfileRefreshCandidates,
  enrichCreatorRows,
  runCreatorPerformanceProfileRefresh,
  refreshCreatorPerformanceProfiles,
  DEFAULT_CREATOR_PROFILE_TTL_MS,
  DEFAULT_CREATOR_PROFILE_REQUEST_INTERVAL_MS,
};
