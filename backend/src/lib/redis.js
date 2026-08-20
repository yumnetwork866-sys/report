const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/1';
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'manage_team:';

let redisInstance = null;

const createRedisInstance = () => {
  const client = new Redis(REDIS_URL, {
    keyPrefix: KEY_PREFIX,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Redis] Connected successfully (DB: ${REDIS_URL}, prefix: "${KEY_PREFIX}")`);
    }
  });

  client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Redis] Connection error:', err.message);
    }
  });

  return client;
};

const getRedisClient = () => {
  if (!redisInstance) {
    redisInstance = createRedisInstance();
  }
  return redisInstance;
};

const redis = getRedisClient();

const isTestMode = () => process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_CACHE !== 'true';

/**
 * Get cached JSON data by key
 * @param {string} key
 * @returns {Promise<any|null>}
 */
const getCache = async (key) => {
  if (isTestMode()) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Redis] getCache error for key "${key}":`, err.message);
    }
    return null;
  }
};

/**
 * Set cached JSON data with TTL in seconds
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds (default 300s = 5m)
 * @returns {Promise<boolean>}
 */
const setCache = async (key, value, ttlSeconds = 300) => {
  if (isTestMode()) return true;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Redis] setCache error for key "${key}":`, err.message);
    }
    return false;
  }
};

/**
 * Delete key from cache
 * @param {string} key
 * @returns {Promise<boolean>}
 */
const delCache = async (key) => {
  if (isTestMode()) return true;
  try {
    await redis.del(key);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Redis] delCache error for key "${key}":`, err.message);
    }
    return false;
  }
};

/**
 * Get from cache or fetch and cache automatically
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {Function} fetcherFn
 * @returns {Promise<{ data: any, hit: boolean }>}
 */
const getOrSetCache = async (key, ttlSeconds, fetcherFn) => {
  if (isTestMode()) {
    return { data: await fetcherFn(), hit: false };
  }
  const cached = await getCache(key);
  if (cached !== null && cached !== undefined) {
    return { data: cached, hit: true };
  }
  const fresh = await fetcherFn();
  if (fresh !== undefined) {
    await setCache(key, fresh, ttlSeconds);
  }
  return { data: fresh, hit: false };
};

/**
 * Check if Redis connection is active and healthy
 * @returns {Promise<boolean>}
 */
const checkRedisHealth = async () => {
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pingRes = await redis.ping();
    return pingRes === 'PONG';
  } catch {
    return false;
  }
};

/**
 * Delete keys by matching pattern using non-blocking SCAN
 * @param {string} pattern e.g. "report:*"
 * @returns {Promise<number>} number of deleted keys
 */
const delByPattern = async (pattern) => {
  if (isTestMode()) return 0;
  try {
    const fullPattern = `${KEY_PREFIX}${pattern}`;
    let cursor = '0';
    let deletedCount = 0;
    do {
      const [nextCursor, rawKeys] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = nextCursor;
      if (rawKeys && rawKeys.length > 0) {
        // Strip prefix since redis client auto-prepends it
        const strippedKeys = rawKeys.map((k) => (k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k));
        await redis.del(...strippedKeys);
        deletedCount += strippedKeys.length;
      }
    } while (cursor !== '0');
    return deletedCount;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Redis] delByPattern error for "${pattern}":`, err.message);
    }
    return 0;
  }
};

/**
 * Close Redis connection cleanly (useful for shutdown / tests)
 */
const closeRedis = async () => {
  if (redisInstance) {
    try {
      await redisInstance.quit();
    } catch {
      redisInstance.disconnect();
    }
    redisInstance = null;
  }
};

module.exports = {
  redis,
  getRedisClient,
  getCache,
  setCache,
  delCache,
  delByPattern,
  getOrSetCache,
  checkRedisHealth,
  closeRedis,
};
