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
      };
    })
    .filter((session) => session.live_id);
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
  const sessions = await fetchShopLiveSessions({
    shop,
    startDate,
    endDate,
    currency,
    fetchImpl,
    performanceLoader,
  });
  return { lives: await buildLiveSessions(sessions, { db }) };
};

module.exports = {
  buildLiveSessions,
  fetchShopLiveSessions,
  loadHashtagHosts,
  loadShopLivePerformance,
  mergeSessions,
  resolveAutoHost,
  toEpochMs,
  __test: {
    extractHashtags,
    matchesHashtags,
  },
};
