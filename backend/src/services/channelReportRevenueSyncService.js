const { Op } = require('sequelize');
const {
  ChannelReportVideoRevenueDaily,
  ChannelReportRevenueSyncDay,
  sequelize,
} = require('../models');
const { getShopVideoPerformance } = require('./tiktokShopService');
const { scheduledAnalyticsRange } = require('./tiktokShopAnalyticsSyncService');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const ACCOUNT_TYPES = ['OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS'];

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const config = () => ({
  historyDays: positiveInteger(process.env.CHANNEL_REPORT_REVENUE_HISTORY_DAYS, 90),
  refreshDays: positiveInteger(process.env.CHANNEL_REPORT_REVENUE_REFRESH_DAYS, 7),
  initialBackfillDays: positiveInteger(process.env.CHANNEL_REPORT_REVENUE_INITIAL_BACKFILL_DAYS, 30),
  backfillDays: positiveInteger(process.env.CHANNEL_REPORT_REVENUE_BACKFILL_DAYS, 10),
  maxPages: positiveInteger(process.env.CHANNEL_REPORT_REVENUE_MAX_PAGES, 500),
});

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Job was stopped by the user.');
  error.name = 'AbortError';
  throw error;
};

const shiftDate = (date, days) => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

const videoId = (video) => String(video?.id || video?.video_id || '').trim();
const videoRevenue = (video) => {
  const amount = Number(video?.gmv?.amount ?? video?.gmv);
  return Number.isFinite(amount) ? amount : null;
};

const fetchVideoPage = (shop, options) => {
  if (isDemoAuthorization(shop.authorization)) {
    return sellerAffiliateFixture('shop-video-performance', shop, {
      ...options,
      account_type: options.accountType,
      start_date: options.startDate,
      end_date: options.endDate,
    });
  }
  return getShopVideoPerformance({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    ...options,
  });
};

const loadAccountRevenue = async (shop, options, accountType, {
  maxPages = 500,
  signal,
} = {}) => {
  const videos = [];
  const seenTokens = new Set();
  let pageToken;

  for (let page = 0; page < maxPages; page += 1) {
    throwIfAborted(signal);
    const payload = await fetchVideoPage(shop, { ...options, accountType, pageToken });
    const pageVideos = payload?.data?.videos;
    const emptyPage = pageVideos === undefined && Number(payload?.data?.total_count) === 0;
    if (!Array.isArray(pageVideos) && !emptyPage) {
      throw new Error(`TikTok returned an invalid video performance response for ${accountType}.`);
    }
    videos.push(...(pageVideos || []).map((video) => ({ ...video, account_type: accountType })));

    const nextToken = String(payload.data.next_page_token || '').trim();
    if (!nextToken) return videos;
    if (seenTokens.has(nextToken)) {
      throw new Error(`TikTok returned a repeated video page token for ${accountType}.`);
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }

  throw new Error(`TikTok video pagination exceeded the safety limit of ${maxPages} pages for ${accountType}.`);
};

const loadRevenueDay = async (shop, metricDate, { signal, maxPages = 500 } = {}) => {
  const options = {
    startDate: metricDate,
    endDate: shiftDate(metricDate, 1),
    currency: 'LOCAL',
    sortField: 'gmv',
    sortOrder: 'DESC',
    pageSize: 100,
  };
  const accountResults = await Promise.all(ACCOUNT_TYPES.map((accountType) => (
    loadAccountRevenue(shop, options, accountType, { maxPages, signal })
  )));
  const videos = new Map();
  accountResults.flat().forEach((video) => {
    const id = videoId(video);
    if (id) videos.set(id, video);
  });
  return [...videos.values()];
};

const persistRevenueDay = async (shop, metricDate, videos) => {
  const syncedAt = new Date();
  const rows = videos.flatMap((video) => {
    const id = videoId(video);
    const revenue = videoRevenue(video);
    if (!id || revenue === null) return [];
    return [{
      shop_id: shop.id,
      platform_video_id: id,
      metric_date: metricDate,
      account_type: video.account_type,
      revenue,
      currency: video?.gmv?.currency || video?.sales_currency || null,
      raw_metrics: video,
      synced_at: syncedAt,
    }];
  });

  await sequelize.transaction(async (transaction) => {
    await ChannelReportVideoRevenueDaily.destroy({
      where: { shop_id: shop.id, metric_date: metricDate },
      transaction,
    });
    if (rows.length) {
      await ChannelReportVideoRevenueDaily.bulkCreate(rows, { transaction });
    }
    await ChannelReportRevenueSyncDay.upsert({
      shop_id: shop.id,
      metric_date: metricDate,
      video_count: rows.length,
      synced_at: syncedAt,
    }, { transaction });
  });
  return rows.length;
};

const selectSyncDates = ({ endDate, existingDates, ...overrides }) => {
  const settings = { ...config(), ...overrides };
  const allDates = Array.from({ length: settings.historyDays }, (_, index) => shiftDate(endDate, -index - 1));
  const existing = new Set(existingDates.map(String));
  const refresh = allDates.slice(0, settings.refreshDays);
  const missingBudget = existing.size ? settings.backfillDays : settings.initialBackfillDays;
  const missing = allDates.filter((date) => !existing.has(date)).slice(0, missingBudget);
  return [...new Set([...refresh, ...missing])];
};

const syncChannelReportRevenue = async (shop, { signal, now = new Date() } = {}) => {
  const settings = config();
  const { endDate } = scheduledAnalyticsRange(shop, now);
  const historyStart = shiftDate(endDate, -settings.historyDays);
  const coverage = await ChannelReportRevenueSyncDay.findAll({
    where: {
      shop_id: shop.id,
      metric_date: { [Op.gte]: historyStart, [Op.lt]: endDate },
    },
    attributes: ['metric_date'],
    raw: true,
  });
  const dates = selectSyncDates({
    endDate,
    existingDates: coverage.map((row) => row.metric_date),
    ...settings,
  });
  const results = [];
  for (const metricDate of dates) {
    throwIfAborted(signal);
    const videos = await loadRevenueDay(shop, metricDate, { signal, maxPages: settings.maxPages });
    const videoCount = await persistRevenueDay(shop, metricDate, videos);
    results.push({ metric_date: metricDate, video_count: videoCount });
  }
  return {
    start_date: dates.at(-1) || null,
    end_date: dates[0] || null,
    days_synced: results.length,
    videos_synced: results.reduce((sum, item) => sum + item.video_count, 0),
    results,
  };
};

module.exports = {
  syncChannelReportRevenue,
  __test: {
    loadAccountRevenue,
    loadRevenueDay,
    persistRevenueDay,
    selectSyncDates,
    shiftDate,
    videoId,
    videoRevenue,
  },
};
