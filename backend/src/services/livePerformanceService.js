const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { extractHashtags, matchesHashtags } = require('../lib/hashtagUtils');
const { getShopLivePerformance } = require('./tiktokShopService');

const LIVE_ACCOUNT_TYPES = ['OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS', 'AFFILIATE_ACCOUNTS'];
const MAX_PAGES = 20;

const toEpochMs = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e12 ? value : Math.round(value * 1000);
  }
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  if (Number.isFinite(num)) {
    if (num <= 0) return null;
    return num > 1e12 ? num : Math.round(num * 1000);
  }
  const parsed = Date.parse(str);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
};

const loadHashtagHosts = async (db = sequelize) => {
  const rows = await db.query(`
    SELECT u.id, u.name, u.email, u.avatar_url, attribution.hashtags
    FROM users u
    JOIN user_content_attributions attribution ON attribution.user_id = u.id
    WHERE u.is_active = TRUE
      AND jsonb_typeof(attribution.hashtags) = 'array'
  `, { type: QueryTypes.SELECT });
  return rows
    .map((row) => ({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
      },
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    }))
    .filter((row) => row.hashtags.length > 0);
};

const resolveAutoHost = (title, hosts = []) => {
  if (!title || !Array.isArray(hosts) || !hosts.length) return null;
  const matches = hosts.filter((row) => matchesHashtags(title, row.hashtags));
  return matches.length === 1 ? matches[0].user : null;
};

const mergeSessions = (sessionGroups = []) => {
  const sessionsById = new Map();
  sessionGroups.flat().forEach((session) => {
    const id = String(session?.id || '').trim();
    if (!id) return;
    const existing = sessionsById.get(id);
    if (!existing) {
      sessionsById.set(id, session);
      return;
    }
    const merged = { ...existing };
    if (!existing.title && session.title) {
      merged.title = session.title;
    }
    if (!existing.creator && session.creator) {
      merged.creator = session.creator;
    } else if (existing.creator && session.creator) {
      merged.creator = {
        ...session.creator,
        ...existing.creator,
        author_type: existing.creator.author_type || session.creator.author_type,
      };
    }
    if (!existing.interaction_performance && session.interaction_performance) {
      merged.interaction_performance = session.interaction_performance;
    } else if (existing.interaction_performance && session.interaction_performance) {
      merged.interaction_performance = {
        ...session.interaction_performance,
        ...existing.interaction_performance,
        comments: existing.interaction_performance.comments ?? session.interaction_performance.comments,
        comment_rate: existing.interaction_performance.comment_rate ?? session.interaction_performance.comment_rate,
      };
    }
    if (!existing.sales_performance && session.sales_performance) {
      merged.sales_performance = session.sales_performance;
    } else if (existing.sales_performance && session.sales_performance) {
      merged.sales_performance = {
        ...session.sales_performance,
        ...existing.sales_performance,
        live_attributed_gmv: existing.sales_performance.live_attributed_gmv ?? session.sales_performance.live_attributed_gmv,
        sku_orders: existing.sales_performance.sku_orders ?? session.sales_performance.sku_orders,
        items_sold: existing.sales_performance.items_sold ?? session.sales_performance.items_sold,
      };
    }
    if (!existing.start_time && session.start_time) merged.start_time = session.start_time;
    if (!existing.end_time && session.end_time) merged.end_time = session.end_time;
    if (!existing.duration && session.duration) merged.duration = session.duration;
    if (!existing.traffic && session.traffic) merged.traffic = session.traffic;
    sessionsById.set(id, merged);
  });
  return [...sessionsById.values()];
};

const fetchShopLiveSessions = async ({
  shop,
  startDate,
  endDate,
  currency = 'LOCAL',
  fetchImpl,
  performanceLoader = getShopLivePerformance,
}) => {
  const results = await Promise.allSettled(LIVE_ACCOUNT_TYPES.map(async (accountType) => {
    const sessions = [];
    let pageToken;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await performanceLoader({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        startDate,
        endDate,
        currency,
        accountType,
        pageSize: 100,
        pageToken,
      }, fetchImpl);
      const pageSessions = payload?.data?.live_stream_sessions;
      if (Array.isArray(pageSessions)) sessions.push(...pageSessions);
      pageToken = payload?.data?.next_page_token;
      if (!pageToken) break;
    }
    return sessions;
  }));
  const groups = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (!groups.length) throw results[0].reason;
  return mergeSessions(groups);
};

const extractSalesPerformance = (session) => {
  if (!session || typeof session !== 'object') return null;
  const sales = session.sales_performance || session.performance?.sales || null;

  const rawGmvObj = sales?.live_attributed_gmv
    ?? session.live_attributed_gmv
    ?? sales?.gmv
    ?? session.gmv;

  let gmvAmount = null;
  let gmvCurrency = null;
  if (rawGmvObj !== undefined && rawGmvObj !== null && rawGmvObj !== '') {
    if (typeof rawGmvObj === 'object') {
      const val = rawGmvObj.amount !== undefined ? rawGmvObj.amount : rawGmvObj.value;
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        gmvAmount = Number(val);
      }
      gmvCurrency = rawGmvObj.currency || null;
    } else if (!isNaN(Number(rawGmvObj))) {
      gmvAmount = Number(rawGmvObj);
    }
  }

  const rawOrders = sales?.sku_orders ?? sales?.orders ?? session.sku_orders ?? session.orders;
  const orders = rawOrders !== undefined && rawOrders !== null && rawOrders !== '' && !isNaN(Number(rawOrders))
    ? Number(rawOrders)
    : null;

  const rawItemsSold = sales?.items_sold ?? session.items_sold;
  const itemsSold = rawItemsSold !== undefined && rawItemsSold !== null && rawItemsSold !== '' && !isNaN(Number(rawItemsSold))
    ? Number(rawItemsSold)
    : null;

  if (gmvAmount === null && orders === null && itemsSold === null && !sales) {
    return null;
  }

  return {
    live_attributed_gmv: gmvAmount !== null ? { amount: String(gmvAmount), currency: gmvCurrency } : (sales?.live_attributed_gmv || null),
    attributed_gmv: gmvAmount,
    currency: gmvCurrency,
    sku_orders: orders,
    attributed_orders: orders,
    items_sold: itemsSold,
    attributed_items_sold: itemsSold,
  };
};

const buildLiveSessions = async (rawSessions, { db = sequelize } = {}) => {
  const hosts = await loadHashtagHosts(db);
  return (Array.isArray(rawSessions) ? rawSessions : [])
    .map((session) => {
      const title = String(session?.title || '').trim();
      const interactionPerformance = session?.interaction_performance;
      const rawComments = interactionPerformance?.comments
        ?? session?.total_comments
        ?? session?.comments;
      const totalComments = rawComments !== undefined && rawComments !== null && Number.isFinite(Number(rawComments))
        ? Number(rawComments)
        : (interactionPerformance ? 0 : null);

      const rawDuration = session?.duration
        ?? session?.duration_seconds
        ?? session?.live_duration
        ?? session?.traffic?.duration
        ?? session?.traffic?.live_duration
        ?? session?.performance?.overall?.duration
        ?? session?.overall?.duration;
      let durationSec = rawDuration !== undefined && rawDuration !== null && Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0
        ? Math.round(Number(rawDuration))
        : null;

      const startTimeMs = toEpochMs(session?.start_time);
      let endTimeMs = toEpochMs(session?.end_time);

      if (startTimeMs && endTimeMs && endTimeMs > startTimeMs) {
        if (!durationSec) {
          durationSec = Math.floor((endTimeMs - startTimeMs) / 1000);
        }
      } else if (startTimeMs && durationSec && (!endTimeMs || endTimeMs <= startTimeMs)) {
        endTimeMs = startTimeMs + durationSec * 1000;
      }

      const salesPerformance = extractSalesPerformance(session);

      return {
        live_id: String(session?.id || '').trim(),
        title,
        creator_username: session?.creator?.user_name || null,
        creator_nickname: session?.creator?.nick_name || null,
        author_type: session?.creator?.author_type || session?.author_type || null,
        creator_author_type: session?.creator?.author_type || session?.author_type || null,
        start_time: startTimeMs,
        end_time: endTimeMs,
        duration: durationSec,
        duration_seconds: durationSec,
        hashtags: extractHashtags(title),
        auto_host: resolveAutoHost(title, hosts),
        total_comments: totalComments,
        interaction_performance: interactionPerformance || null,
        sales_performance: salesPerformance,
        attributed_gmv: salesPerformance?.attributed_gmv ?? null,
        sales_currency: salesPerformance?.currency ?? null,
        attributed_orders: salesPerformance?.attributed_orders ?? null,
        attributed_items_sold: salesPerformance?.attributed_items_sold ?? null,
      };
    })
    .filter((session) => session.live_id);
};

const saveLiveSessionPerformances = async (shopId, lives, { db = sequelize, rawSessions = [] } = {}) => {
  if (!shopId || !Array.isArray(lives) || lives.length === 0 || !db?.query) return 0;
  const rawMap = new Map();
  if (Array.isArray(rawSessions)) {
    rawSessions.forEach((s) => {
      if (s?.id) rawMap.set(String(s.id).trim(), s);
    });
  }

  let count = 0;
  for (const live of lives) {
    const sessionId = String(live.live_id || live.id || '').trim();
    if (!sessionId) continue;
    const raw = rawMap.get(sessionId) || live.raw_data || {};
    const duration = live.duration_seconds ?? live.duration ?? null;
    const salesPerformance = live.sales_performance || extractSalesPerformance(raw);
    const rawToSave = {
      ...raw,
      ...(salesPerformance ? { sales_performance: salesPerformance } : {}),
    };

    await db.query(`
      INSERT INTO live_session_performances (
        shop_id, session_id, title, creator_username, creator_nickname,
        author_type, start_time, end_time, duration_seconds, total_comments,
        hashtags, interaction_performance, raw_data, updated_at
      ) VALUES (
        :shopId, :sessionId, :title, :creatorUsername, :creatorNickname,
        :authorType, :startTime, :endTime, :durationSeconds, :totalComments,
        :hashtags::jsonb, :interactionPerformance::jsonb, :rawData::jsonb, NOW()
      )
      ON CONFLICT (shop_id, session_id) DO UPDATE SET
        title = COALESCE(NULLIF(EXCLUDED.title, ''), live_session_performances.title),
        creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), live_session_performances.creator_username),
        creator_nickname = COALESCE(NULLIF(EXCLUDED.creator_nickname, ''), live_session_performances.creator_nickname),
        author_type = COALESCE(NULLIF(EXCLUDED.author_type, ''), live_session_performances.author_type),
        start_time = COALESCE(EXCLUDED.start_time, live_session_performances.start_time),
        end_time = COALESCE(EXCLUDED.end_time, live_session_performances.end_time),
        duration_seconds = COALESCE(EXCLUDED.duration_seconds, live_session_performances.duration_seconds),
        total_comments = COALESCE(EXCLUDED.total_comments, live_session_performances.total_comments),
        hashtags = CASE WHEN jsonb_array_length(EXCLUDED.hashtags) > 0 THEN EXCLUDED.hashtags ELSE live_session_performances.hashtags END,
        interaction_performance = COALESCE(EXCLUDED.interaction_performance, live_session_performances.interaction_performance),
        raw_data = CASE WHEN EXCLUDED.raw_data != '{}'::jsonb THEN EXCLUDED.raw_data ELSE live_session_performances.raw_data END,
        updated_at = NOW()
    `, {
      replacements: {
        shopId: Number(shopId),
        sessionId,
        title: live.title || null,
        creatorUsername: live.creator_username || null,
        creatorNickname: live.creator_nickname || null,
        authorType: live.author_type || live.creator_author_type || null,
        startTime: live.start_time ? Number(live.start_time) : null,
        endTime: live.end_time ? Number(live.end_time) : null,
        durationSeconds: duration !== null && Number.isFinite(Number(duration)) ? Number(duration) : null,
        totalComments: live.total_comments !== null && Number.isFinite(Number(live.total_comments)) ? Number(live.total_comments) : null,
        hashtags: JSON.stringify(Array.isArray(live.hashtags) ? live.hashtags : []),
        interactionPerformance: live.interaction_performance ? JSON.stringify(live.interaction_performance) : null,
        rawData: JSON.stringify(rawToSave),
      },
      type: QueryTypes.INSERT,
    });
    count += 1;
  }
  return count;
};

const loadPersistedLiveSessions = async (shopId, { startDate, endDate, db = sequelize } = {}) => {
  if (!shopId || !db?.query) return [];
  const startEpoch = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) - 24 * 3600 * 1000 : null;
  const endEpoch = endDate ? Date.parse(`${endDate}T23:59:59.999Z`) + 24 * 3600 * 1000 : null;

  try {
    const rows = await db.query(`
      SELECT shop_id, session_id, title, creator_username, creator_nickname,
             author_type, start_time, end_time, duration_seconds, total_comments,
             hashtags, interaction_performance, raw_data, updated_at
      FROM live_session_performances
      WHERE shop_id = :shopId
        AND (:startEpoch::BIGINT IS NULL OR start_time IS NULL OR end_time IS NULL OR end_time >= :startEpoch)
        AND (:endEpoch::BIGINT IS NULL OR start_time IS NULL OR start_time <= :endEpoch)
      ORDER BY start_time DESC NULLS LAST
    `, {
      replacements: {
        shopId: Number(shopId),
        startEpoch,
        endEpoch,
      },
      type: QueryTypes.SELECT,
    });

    if (!Array.isArray(rows) || !rows.length) return [];
    const hosts = await loadHashtagHosts(db).catch(() => []);
    return rows.map((row) => {
      const title = String(row.title || '').trim();
      const duration = row.duration_seconds !== null ? Number(row.duration_seconds) : null;
      const salesPerformance = extractSalesPerformance(row.raw_data);
      return {
        live_id: row.session_id,
        id: row.session_id,
        shop_id: row.shop_id,
        title,
        creator_username: row.creator_username || null,
        creator_nickname: row.creator_nickname || null,
        author_type: row.author_type || null,
        creator_author_type: row.author_type || null,
        start_time: row.start_time ? Number(row.start_time) : null,
        end_time: row.end_time ? Number(row.end_time) : null,
        duration,
        duration_seconds: duration,
        hashtags: Array.isArray(row.hashtags) ? row.hashtags : extractHashtags(title),
        auto_host: resolveAutoHost(title, hosts),
        total_comments: row.total_comments !== null ? Number(row.total_comments) : null,
        interaction_performance: row.interaction_performance || null,
        sales_performance: salesPerformance,
        attributed_gmv: salesPerformance?.attributed_gmv ?? null,
        sales_currency: salesPerformance?.currency ?? null,
        attributed_orders: salesPerformance?.attributed_orders ?? null,
        attributed_items_sold: salesPerformance?.attributed_items_sold ?? null,
      };
    });
  } catch (err) {
    console.warn(`[livePerformanceService] Failed to load persisted sessions for shop ${shopId}:`, err?.message);
    return [];
  }
};

const loadShopLivePerformance = async ({
  shop,
  startDate,
  endDate,
  currency,
  db = sequelize,
  fetchImpl,
  performanceLoader,
}) => {
  let apiLives = [];
  let apiError = null;
  try {
    const rawSessions = await fetchShopLiveSessions({
      shop,
      startDate,
      endDate,
      currency,
      fetchImpl,
      performanceLoader,
    });
    apiLives = await buildLiveSessions(rawSessions, { db });
    if (apiLives.length > 0 && shop?.id) {
      await saveLiveSessionPerformances(shop.id, apiLives, { db, rawSessions }).catch((err) => {
        console.error('[livePerformanceService] Error saving live sessions to DB:', err?.message);
      });
    }
  } catch (err) {
    apiError = err;
    console.warn(`[livePerformanceService] TikTok Compass API fetch failed for shop ${shop?.id}:`, err?.message);
  }

  // Load persisted sessions from DB to merge or fallback
  const dbLives = shop?.id ? await loadPersistedLiveSessions(shop.id, { startDate, endDate, db }) : [];

  if (apiError && !dbLives.length) {
    throw apiError;
  }

  // Merge: dbLives as base, overlaid by apiLives
  const mergedMap = new Map();
  dbLives.forEach((live) => mergedMap.set(String(live.live_id), live));

  apiLives.forEach((apiLive) => {
    const existing = mergedMap.get(String(apiLive.live_id));
    if (existing) {
      mergedMap.set(String(apiLive.live_id), {
        ...existing,
        ...apiLive,
        duration: apiLive.duration ?? existing.duration,
        duration_seconds: apiLive.duration_seconds ?? existing.duration_seconds,
        start_time: apiLive.start_time ?? existing.start_time,
        end_time: apiLive.end_time ?? existing.end_time,
        title: apiLive.title || existing.title,
        auto_host: apiLive.auto_host || existing.auto_host,
        sales_performance: apiLive.sales_performance || existing.sales_performance,
        attributed_gmv: apiLive.attributed_gmv ?? existing.attributed_gmv,
        sales_currency: apiLive.sales_currency || existing.sales_currency,
        attributed_orders: apiLive.attributed_orders ?? existing.attributed_orders,
        attributed_items_sold: apiLive.attributed_items_sold ?? existing.attributed_items_sold,
      });
    } else {
      mergedMap.set(String(apiLive.live_id), apiLive);
    }
  });

  return { lives: [...mergedMap.values()] };
};

module.exports = {
  buildLiveSessions,
  extractSalesPerformance,
  fetchShopLiveSessions,
  loadHashtagHosts,
  loadPersistedLiveSessions,
  loadShopLivePerformance,
  mergeSessions,
  resolveAutoHost,
  saveLiveSessionPerformances,
  toEpochMs,
  __test: {
    extractHashtags,
    matchesHashtags,
  },
};
