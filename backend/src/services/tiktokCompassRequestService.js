const crypto = require('crypto');
const { sequelize, TikTokShop } = require('../models');
const { withCompassLock } = require('./tiktokCompassLockService');
const { recordRunEvent } = require('./scheduledRunMonitorService');

const CREATE_ENDPOINT = 'POST /affiliate_seller/202603/compass/offline_task';
const LIST_ENDPOINT = 'GET /affiliate_seller/202603/compass/offline_tasks';
const DOWNLOAD_ENDPOINT = 'GET /affiliate_seller/202603/compass/offline_tasks/:task_id/file';
const hashKey = (parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const compassBucketKey = (platformShopId, endpoint) => hashKey([
  String(process.env.TIKTOK_PARTNER_APP_KEY || '').trim(), String(platformShopId), endpoint,
]);
const resolveCompassShopId = async (shopCipher) => {
  const shop = await TikTokShop.findOne({ where: { cipher: shopCipher }, attributes: ['platform_shop_id'] });
  if (!shop) throw new Error('Compass shop is not connected.');
  return shop.platform_shop_id;
};
const isCompassRateLimitError = (error) => Number(error?.httpStatus) === 429
  || [36009002, 36009037].includes(Number(error?.tiktokCode))
  || /too many requests|rate limit|quota exceeded/i.test(String(error?.message || ''));
const isCompassRetryableError = (error) => isCompassRateLimitError(error)
  || Boolean(error?.compassRetryable)
  || ['TIKTOK_COMPASS_WAIT', 'TIKTOK_COMPASS_COOLDOWN', 'TIKTOK_COMPASS_UNCERTAIN'].includes(error?.code);

const configuredCompassRateLimitCooldownMs = (streak = 1, retryAfterMs = 0, random = Math.random) => {
  const base = Math.max(60000, Number(process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_BASE_COOLDOWN_MS
    || process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_COOLDOWN_MS) || 900000);
  const max = Math.max(base, Number(process.env.TIKTOK_CREATOR_PERFORMANCE_RATE_LIMIT_MAX_COOLDOWN_MS) || 3600000);
  const exponential = Math.min(max, base * (2 ** Math.min(20, Math.max(0, streak - 1))));
  // Positive jitter never shortens Retry-After or the exponential cooldown.
  return Math.max(Number(retryAfterMs) || 0, exponential + Math.floor(exponential * 0.2 * random()));
};

const compassWaitError = (until, code = 'TIKTOK_COMPASS_WAIT') => Object.assign(
  new Error(`TikTok Compass request deferred until ${new Date(until).toISOString()}.`),
  { code, cooldownUntil: until, retryAfterMs: Math.max(0, until - Date.now()), compassRetryable: true },
);

const createCompassRequestGate = ({
  db = sequelize, now = Date.now, random = Math.random, withLock = withCompassLock,
  resolveShopId = resolveCompassShopId,
} = {}) => (
  async ({ shopCipher, endpoint }, operation) => {
    if (!shopCipher) throw new Error('A shop cipher is required for the Compass request gate.');
    // Resolve the stable platform ID so a cipher change cannot reset the bucket.
    const bucketKey = compassBucketKey(await resolveShopId(shopCipher), endpoint);
    const outcome = await withLock(db, bucketKey, 81428, async (lockedDb) => {
      const [rows] = await lockedDb.query('SELECT * FROM tiktok_compass_request_gates WHERE bucket_key = :key', {
        replacements: { key: bucketKey },
      });
      const state = rows[0] || {};
      const cooldownUntil = new Date(state.cooldown_until || 0).getTime();
      const availableAt = Math.max(cooldownUntil, new Date(state.next_request_at || 0).getTime());
      if (availableAt > now()) {
        await recordRunEvent('REQUEST_DEFERRED', { status: 'RETRY_PENDING', endpoint, next_retry_at: new Date(availableAt), message: cooldownUntil > now() ? 'Endpoint cooldown is active; no HTTP request sent.' : 'Waiting for the next request slot; no HTTP request sent.' });
        return { error: compassWaitError(availableAt, cooldownUntil > now() ? 'TIKTOK_COMPASS_COOLDOWN' : 'TIKTOK_COMPASS_WAIT') };
      }
      const interval = endpoint === CREATE_ENDPOINT
        ? Math.max(1000, Number(process.env.TIKTOK_COMPASS_CREATE_INTERVAL_MS) || 60000) : 0;
      // Autocommit the slot before HTTP. Session locks serialize live requests
      // without rolling back the slot/cooldown if the process disconnects.
      await lockedDb.query(`
        INSERT INTO tiktok_compass_request_gates (bucket_key, next_request_at)
        VALUES (:key, :next) ON CONFLICT (bucket_key) DO UPDATE
        SET next_request_at = EXCLUDED.next_request_at, updated_at = NOW()
      `, { replacements: { key: bucketKey, next: new Date(now() + interval) } });
      let requestCompleted = false;
      try {
        const value = await operation();
        requestCompleted = true;
        await lockedDb.query(`UPDATE tiktok_compass_request_gates
          SET consecutive_rate_limits = 0, cooldown_until = NULL, updated_at = NOW()
          WHERE bucket_key = :key`, { replacements: { key: bucketKey } });
        return { value };
      } catch (error) {
        if (requestCompleted) {
          // The HTTP request succeeded but persisting gate state failed. Treat
          // this as an unknown create outcome, never as a preflight rejection.
          error.requestOutcomeUnknown = true;
          error.compassRetryable = true;
          return { error };
        }
        if (isCompassRateLimitError(error)) {
          const streak = (Number(state.consecutive_rate_limits) || 0) + 1;
          error.cooldownUntil = now() + configuredCompassRateLimitCooldownMs(streak, error.retryAfterMs, random);
          error.compassRetryable = true;
          await recordRunEvent('COOLDOWN_STARTED', { status: 'RETRY_PENDING', endpoint, request_id: error.requestId, next_retry_at: new Date(error.cooldownUntil), retry_after: error.retryAfter, message: error.message });
          await lockedDb.query(`UPDATE tiktok_compass_request_gates
            SET consecutive_rate_limits = :streak, cooldown_until = :until, updated_at = NOW()
            WHERE bucket_key = :key`, {
            replacements: { key: bucketKey, streak, until: new Date(error.cooldownUntil) },
          }).catch((persistError) => {
            console.error('[Compass] Could not persist endpoint cooldown', persistError.message);
          });
        } else if (error.requestOutcomeUnknown || error.httpStatus >= 500) {
          error.compassRetryable = true;
          error.cooldownUntil = now() + 60000;
        }
        return { error };
      }
    });
    if (outcome.busy) throw compassWaitError(now() + 5000);
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }
);

const runCompassApiRequest = createCompassRequestGate();
module.exports = {
  CREATE_ENDPOINT, LIST_ENDPOINT, DOWNLOAD_ENDPOINT, hashKey, compassBucketKey,
  isCompassRateLimitError, isCompassRetryableError, configuredCompassRateLimitCooldownMs,
  compassWaitError, createCompassRequestGate, runCompassApiRequest,
};
