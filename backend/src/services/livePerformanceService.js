const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { extractHashtags, matchesHashtags } = require('../lib/hashtagUtils');
const { getShopLivePerformance } = require('./tiktokShopService');

const LIVE_ACCOUNT_TYPES = ['OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS', 'AFFILIATE_ACCOUNTS'];
const MAX_PAGES = 20;

const toEpochMs = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number > 1e12 ? number : number * 1000;
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
    if (!existing.title && session.title) {
      sessionsById.set(id, { ...existing, ...session });
      return;
    }
    if (!existing.interaction_performance && session.interaction_performance) {
      sessionsById.set(id, { ...existing, interaction_performance: session.interaction_performance });
    }
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
      return {
        live_id: String(session?.id || '').trim(),
        title,
        creator_username: session?.creator?.user_name || null,
        creator_nickname: session?.creator?.nick_name || null,
        start_time: toEpochMs(session?.start_time),
        end_time: toEpochMs(session?.end_time),
        hashtags: extractHashtags(title),
        auto_host: resolveAutoHost(title, hosts),
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
