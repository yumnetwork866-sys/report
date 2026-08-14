const { Op } = require('sequelize');
const {
  ShopVideo,
  ShopVideoPerformanceSnapshot,
} = require('../models');
const { getShopVideoPerformance } = require('./tiktokShopService');
const { upsertShopProducts } = require('./shopProductCatalogService');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const SHOP_VIDEO_ACCOUNT_TYPES = [
  'OFFICIAL_ACCOUNTS',
  'MARKETING_ACCOUNTS',
  'AFFILIATE_ACCOUNTS',
];
const dateOnly = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
const shiftDate = (value, days) => {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
};
const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();
const videoUsername = (video) => normalizedUsername(
  video?.creator?.user_name || video?.creator?.username || video?.username,
);
const videoPostedAt = (video) => {
  const raw = String(video?.video_post_time || video?.post_time || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const normalizedVideo = (shopId, video, now, accountType = 'AFFILIATE_ACCOUNTS') => {
  const platformVideoId = String(video?.id || video?.video_id || '').trim();
  const creatorUsername = videoUsername(video);
  const gmv = video?.gmv && typeof video.gmv === 'object'
    ? video.gmv
    : { amount: video?.gmv, currency: null };
  return {
    catalog: {
      shop_id: shopId,
      platform_video_id: platformVideoId,
      account_type: accountType,
      creator_username: creatorUsername || null,
      title: String(video?.title || platformVideoId || 'TikTok video'),
      video_url: platformVideoId && creatorUsername
        ? `https://www.tiktok.com/@${encodeURIComponent(creatorUsername)}/video/${encodeURIComponent(platformVideoId)}`
        : null,
      posted_at: videoPostedAt(video),
      first_seen_at: now,
      last_seen_at: now,
      raw_data: video,
      updated_at: now,
    },
    metrics: {
      gross_gmv: numberOrZero(gmv?.amount),
      orders: numberOrZero(video?.sku_orders ?? video?.orders),
      items_sold: numberOrZero(video?.items_sold ?? video?.units_sold),
      views: numberOrZero(video?.views ?? video?.video_views),
      ctr: video?.click_through_rate ?? video?.ctr ?? null,
      currency: gmv?.currency || null,
      raw_metrics: video,
      synced_at: now,
    },
  };
};

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  if (!signal) return;
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    const error = new Error('Job was stopped by the user.');
    error.name = 'AbortError';
    reject(error);
  }, { once: true });
});

const requestPage = async (shop, options, signal) => {
  const accountType = SHOP_VIDEO_ACCOUNT_TYPES.includes(options.accountType)
    ? options.accountType
    : 'AFFILIATE_ACCOUNTS';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    try {
      return isDemoAuthorization(shop.authorization)
        ? sellerAffiliateFixture('shop-video-performance', shop, {
          account_type: accountType,
          currency: 'LOCAL',
          ...options,
        })
        : await getShopVideoPerformance({
          authorization: shop.authorization,
          shopCipher: shop.cipher,
          currency: 'LOCAL',
          accountType,
          sortField: 'gmv',
          sortOrder: 'DESC',
          pageSize: 100,
          ...options,
        });
    } catch (error) {
      const retryable = Number(error.tiktokCode) === 36009002
        || /too many requests|rate limit|timeout|network|fetch/i.test(String(error.message || ''));
      if (!retryable || attempt === 3) throw error;
      await wait(1000 * (2 ** attempt), signal);
    }
  }
  return null;
};

const persistPage = async (shopId, videos, {
  now, startDate, endDate, accountType,
}) => {
  const rowsByVideoId = new Map();
  videos.map((video) => normalizedVideo(shopId, video, now, accountType))
    .filter((row) => row.catalog.platform_video_id)
    .forEach((row) => rowsByVideoId.set(row.catalog.platform_video_id, row));
  const rows = [...rowsByVideoId.values()];
  if (!rows.length) return 0;
  await ShopVideo.bulkCreate(rows.map((row) => row.catalog), {
    updateOnDuplicate: [
      'account_type', 'creator_username', 'title', 'video_url', 'posted_at',
      'last_seen_at', 'raw_data', 'updated_at',
    ],
  });
  await upsertShopProducts(shopId, rows.flatMap((row) => (
    Array.isArray(row.catalog.raw_data?.products) ? row.catalog.raw_data.products : []
  )));
  const ids = rows.map((row) => row.catalog.platform_video_id);
  const stored = await ShopVideo.findAll({
    where: { shop_id: shopId, platform_video_id: { [Op.in]: ids } },
    attributes: ['id', 'platform_video_id'],
  });
  const byPlatformId = new Map(stored.map((row) => [String(row.platform_video_id), row.id]));
  await ShopVideoPerformanceSnapshot.bulkCreate(rows.map((row) => ({
    shop_video_id: byPlatformId.get(row.catalog.platform_video_id),
    snapshot_date: dateOnly(now),
    window_start: startDate,
    window_end: shiftDate(endDate, -1),
    ...row.metrics,
  })).filter((row) => row.shop_video_id), {
    updateOnDuplicate: [
      'window_start', 'window_end', 'gross_gmv', 'orders', 'items_sold',
      'views', 'ctr', 'currency', 'raw_metrics', 'synced_at',
    ],
  });
  return rows.length;
};

const syncShopVideoCatalog = async (shop, { now = new Date(), signal } = {}) => {
  if (!shop?.authorization) throw new Error('TikTok Shop is not connected.');
  const configuredLookback = Number(process.env.SHOP_VIDEO_SYNC_LOOKBACK_DAYS);
  const lookbackDays = Number.isInteger(configuredLookback)
    ? Math.min(89, Math.max(1, configuredLookback))
    : 89;
  const configuredMaxPages = Number(process.env.SHOP_VIDEO_SYNC_MAX_PAGES);
  const maxPages = Number.isInteger(configuredMaxPages)
    ? Math.min(500, Math.max(1, configuredMaxPages))
    : 200;
  const startDate = shiftDate(now, -lookbackDays);
  const endDate = shiftDate(now, 1);
  let total = 0;
  let pages = 0;
  const seenVideoIds = new Set();
  const accountTypes = {};
  for (const accountType of SHOP_VIDEO_ACCOUNT_TYPES) {
    let pageToken = null;
    let accountTotal = 0;
    let accountPages = 0;
    do {
      const payload = await requestPage(shop, {
        startDate,
        endDate,
        pageToken,
        accountType,
      }, signal);
      const videos = (payload?.data?.videos || []).filter((video) => {
        const id = String(video?.id || video?.video_id || '').trim();
        if (!id || seenVideoIds.has(id)) return false;
        seenVideoIds.add(id);
        return true;
      });
      const stored = await persistPage(shop.id, videos, {
        now, startDate, endDate, accountType,
      });
      accountTotal += stored;
      total += stored;
      accountPages += 1;
      pages += 1;
      pageToken = payload?.data?.next_page_token || null;
      if (pageToken && accountPages >= maxPages) {
        const error = new Error(`${accountType} video catalog sync stopped at the safety limit of ${maxPages} pages before TikTok pagination ended.`);
        error.summary = {
          shop_id: shop.id,
          total,
          pages,
          account_type: accountType,
          account_pages: accountPages,
          start_date: startDate,
          end_date: endDate,
        };
        throw error;
      }
    } while (pageToken);
    accountTypes[accountType] = { total: accountTotal, pages: accountPages };
  }
  return {
    total,
    pages,
    account_types: accountTypes,
    start_date: startDate,
    end_date: endDate,
    snapshot_date: dateOnly(now),
  };
};

module.exports = {
  syncShopVideoCatalog,
  __test: {
    SHOP_VIDEO_ACCOUNT_TYPES, dateOnly, shiftDate, normalizedVideo,
  },
};
