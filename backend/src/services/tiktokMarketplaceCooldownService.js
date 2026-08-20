const { TikTokApiCooldown } = require('../models');
const { getCache, setCache, delCache } = require('../lib/redis');

// This namespace is intentionally isolated to the Creator Discovery tab.
// Creator Performance and scheduled profile jobs keep their own cooldown.
const MARKETPLACE_COOLDOWN_NAMESPACE = 'creator_marketplace_discovery';
const DEFAULT_MARKETPLACE_COOLDOWN_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_COOLDOWN_MS) || 5 * 60 * 1000,
);
const MAX_MARKETPLACE_COOLDOWN_MS = Math.max(
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_MAX_COOLDOWN_MS) || 60 * 60 * 1000,
);

const marketplaceRateLimitCooldownMs = (consecutiveRateLimits = 1) => Math.min(
  MAX_MARKETPLACE_COOLDOWN_MS,
  DEFAULT_MARKETPLACE_COOLDOWN_MS * (2 ** Math.max(0, Number(consecutiveRateLimits || 1) - 1)),
);

const loadMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  const isDefaultModel = model === TikTokApiCooldown;
  const useCache = isDefaultModel && (process.env.NODE_ENV !== 'test' || process.env.ENABLE_TEST_CACHE === 'true');
  const cacheKey = `cooldown:marketplace:${shopId}`;

  if (useCache) {
    const cachedTimestamp = await getCache(cacheKey);
    if (cachedTimestamp !== null && typeof cachedTimestamp === 'number') {
      return cachedTimestamp;
    }
  }

  const row = await model.findOne({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
  if (!row?.cooldown_until) return 0;
  const cooldownTimestamp = new Date(row.cooldown_until).getTime();
  const ttlSeconds = Math.max(1, Math.ceil((cooldownTimestamp - Date.now()) / 1000));
  if (useCache && cooldownTimestamp > Date.now()) {
    await setCache(cacheKey, cooldownTimestamp, ttlSeconds);
  }
  return cooldownTimestamp;
};

const persistMarketplaceCooldown = async (
  { shopId, cooldownUntil, reason },
  model = TikTokApiCooldown,
) => {
  await model.upsert({
    shop_id: shopId,
    namespace: MARKETPLACE_COOLDOWN_NAMESPACE,
    cooldown_until: new Date(cooldownUntil),
    reason: String(reason || '').slice(0, 2000) || null,
    updated_at: new Date(),
  });

  const isDefaultModel = model === TikTokApiCooldown;
  const useCache = isDefaultModel && (process.env.NODE_ENV !== 'test' || process.env.ENABLE_TEST_CACHE === 'true');
  if (useCache) {
    const cacheKey = `cooldown:marketplace:${shopId}`;
    const cooldownTimestamp = new Date(cooldownUntil).getTime();
    const ttlSeconds = Math.max(1, Math.ceil((cooldownTimestamp - Date.now()) / 1000));
    if (cooldownTimestamp > Date.now()) {
      await setCache(cacheKey, cooldownTimestamp, ttlSeconds);
    }
  }
};

const clearMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  await model.destroy({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
  if (model === TikTokApiCooldown) {
    await delCache(`cooldown:marketplace:${shopId}`);
  }
};

module.exports = {
  MARKETPLACE_COOLDOWN_NAMESPACE,
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  MAX_MARKETPLACE_COOLDOWN_MS,
  marketplaceRateLimitCooldownMs,
  loadMarketplaceCooldown,
  persistMarketplaceCooldown,
  clearMarketplaceCooldown,
};
