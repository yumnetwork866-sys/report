const crypto = require('crypto');
const { Op, QueryTypes, literal } = require('sequelize');
const {
  User, Booking, TikTokPartnerAuthorization, TikTokShop,
  TikTokTargetCollaborationSnapshot, TikTokCreatorPerformanceExport, TikTokCreatorPerformanceSnapshot,
  TikTokVideoPerformanceSnapshot,
  BookingVideo, BookingVideoPerformanceSnapshot,
  ShopVideo, ShopVideoPerformanceSnapshot, sequelize,
} = require('../models');
const { getOrSetCache, delByPattern } = require('../lib/redis');
const {
  loadCreatorProfiles,
  normalizeCreatorProfile,
} = require('../services/tiktokCreatorProfileService');
const {
  buildAuthorizationUrl,
  parseAuthorizationState,
  exchangeAuthorizationCode,
  getCreatorOverview,
  getCreatorProfileWithAccessToken,
  searchTargetCollaborations,
  tokenFields,
  grantedScopesOf,
  CREATOR_PROFILE_SCOPE,
} = require('../services/tiktokPartnerService');
const { getShopVideoPerformance } = require('../services/tiktokShopService');
const {
  autoLinkBookingVideos,
  calculateActualPerformance,
  matchesBookingProducts,
  metricOfAffiliateSnapshot,
  productIdsOfVideo,
  recordBookingVideoMatch,
  serializeBookingWithActual,
  selectedProductIdsOfBooking,
  syncBookingVideo,
} = require('../services/bookingVideoPerformanceService');
const { handleShopOauthCallback } = require('./tiktokShopController');
const { loadShopProducts, upsertShopProducts } = require('../services/shopProductCatalogService');
const {
  creatorCollaborationsFixture,
  creatorOverviewFixture,
  isDemoAuthorization,
  sellerAffiliateFixture,
} = require('../lib/tiktokDemoFixtures');

const ALLOWED_STATUSES = new Set(['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']);
const BOOKING_PERFORMANCE_WINDOWS = new Set([
  'PAST_7_DAYS', 'PAST_30_DAYS', 'PAST_60_DAYS', 'PAST_90_DAYS',
  'PAST_120_DAYS', 'PAST_150_DAYS', 'PAST_180_DAYS', 'CUSTOM',
]);
const AGGREGATE_BOOKING_WINDOW_DAYS = new Set([60, 90, 120, 150]);
const MAX_CUSTOM_PERFORMANCE_DAYS = 180;

const parseDateOnly = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : parsed;
};

const customPerformanceRange = (startValue, endValue, now = new Date()) => {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end || start > end) return null;
  const latestCompleteDay = new Date(now);
  latestCompleteDay.setUTCHours(0, 0, 0, 0);
  latestCompleteDay.setUTCDate(latestCompleteDay.getUTCDate() - 1);
  const requestedDays = Math.floor((end - start) / 86400000) + 1;
  if (end > latestCompleteDay || requestedDays > MAX_CUSTOM_PERFORMANCE_DAYS) return null;
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    requestedDays,
  };
};

const compactPayload = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined),
);

const normalizeBookingProducts = (products, productIds = []) => {
  const suppliedProducts = Array.isArray(products) ? products : [];
  const suppliedIds = Array.isArray(productIds) ? productIds : [];
  const byId = new Map();
  for (const product of suppliedProducts) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(product?.name || product?.title || product?.product_name || id),
      image_url: String(product?.imageUrl || product?.image_url || product?.main_image_url || product?.thumbnail_url || '') || null,
    });
  }
  for (const value of suppliedIds) {
    const id = String(value || '').trim();
    if (id && !byId.has(id)) byId.set(id, { id, name: id, image_url: null });
  }
  return [...byId.values()];
};

const affiliateProductsOfSnapshot = (snapshot) => {
  const list = snapshot?.raw_metrics?.list || {};
  const breakdowns = snapshot?.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.breakdowns || [];
  const products = [
    ...(Array.isArray(list.products) ? list.products : []),
    ...(Array.isArray(breakdowns) ? breakdowns : []),
  ];
  const byId = new Map();
  for (const product of products) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    const existing = byId.get(id) || {};
    byId.set(id, {
      id,
      name: product?.name || product?.title || product?.product_name || existing.name || null,
      thumbnail_url: product?.main_image_url || product?.thumbnail_url || product?.image_url || existing.thumbnail_url || null,
    });
  }
  for (const id of String(snapshot?.product_id || '').split(',').map((value) => value.trim()).filter(Boolean)) {
    if (!byId.has(id)) byId.set(id, { id, name: null, thumbnail_url: null });
  }
  return [...byId.values()];
};

const hydrateBookingVideoProducts = async (bookings) => {
  if (!TikTokVideoPerformanceSnapshot?.findAll) return bookings;
  const shopIds = [...new Set(bookings.map((booking) => Number(booking.target_shop_id)).filter(Number.isInteger))];
  const videoIds = [...new Set(bookings.flatMap((booking) => (
    (booking.booking_videos || []).map((video) => String(video.platform_video_id || '').trim())
  )).filter(Boolean))];
  if (!shopIds.length || !videoIds.length) return bookings;
  const snapshots = await TikTokVideoPerformanceSnapshot.findAll({
    where: {
      shop_id: { [Op.in]: shopIds },
      video_id: { [Op.in]: videoIds },
    },
    attributes: ['shop_id', 'video_id', 'product_id', 'raw_metrics'],
    order: [['id', 'DESC']],
  });
  const productsByVideo = new Map();
  for (const snapshot of snapshots) {
    const key = `${snapshot.shop_id}:${snapshot.video_id}`;
    if (!productsByVideo.has(key)) productsByVideo.set(key, affiliateProductsOfSnapshot(snapshot));
  }
  for (const booking of bookings) {
    for (const video of booking.booking_videos || []) {
      video.affiliate_products = productsByVideo.get(`${booking.target_shop_id}:${video.platform_video_id}`) || [];
    }
  }
  const productIds = [...new Set(bookings.flatMap((booking) => (
    (booking.booking_videos || []).flatMap((video) => [...productIdsOfVideo(video)])
  )))];
  const catalogRows = await loadShopProducts(shopIds, productIds);
  const catalogByShopAndProduct = new Map(catalogRows.map((product) => [
    `${product.shop_id}:${product.product_id}`,
    product,
  ]));
  for (const booking of bookings) {
    for (const video of booking.booking_videos || []) {
      const existingById = new Map((video.affiliate_products || []).map((product) => [String(product.id), product]));
      video.affiliate_products = [...productIdsOfVideo(video)].flatMap((productId) => {
        const existing = existingById.get(productId);
        const stored = catalogByShopAndProduct.get(`${booking.target_shop_id}:${productId}`);
        if (!existing && !stored) return [];
        return [{
          id: productId,
          name: stored?.title || existing?.name || null,
          thumbnail_url: stored?.image_url || existing?.thumbnail_url || null,
        }];
      });
    }
  }
  return bookings;
};

const filterBookingVideosBySelectedProducts = (bookings) => bookings.map((booking) => {
  const originalVideos = booking.booking_videos || [];
  const selectedProductIds = new Set([
    ...(booking.evaluation_snapshot?.product_ids || []),
    ...(booking.evaluation_snapshot?.products || []).map((product) => product?.id || product?.product_id),
  ].map((value) => String(value || '').trim()).filter(Boolean));
  const matchingVideos = originalVideos.filter((video) => matchesBookingProducts(booking, video));
  booking.booking_videos = matchingVideos;
  booking.video_match_status = matchingVideos.length
    ? 'MATCHED'
    : !originalVideos.length ? 'NO_VIDEO'
      : selectedProductIds.size && originalVideos.some((video) => productIdsOfVideo(video).size)
        ? 'NO_PRODUCT_MATCH' : 'PRODUCT_DATA_PENDING';
  booking.actual_performance = calculateActualPerformance(booking);
  return booking;
});

const applyBookingVideoPerformanceWindow = async (bookings, performanceWindow) => {
  const days = Number(String(performanceWindow || '').match(/^PAST_(7|30)_DAYS$/)?.[1]);
  if (!days || !bookings.length || !TikTokCreatorPerformanceExport?.findAll || !TikTokVideoPerformanceSnapshot?.findAll) {
    return bookings;
  }
  const shopIds = [...new Set(bookings.map((booking) => Number(booking.target_shop_id)).filter(Number.isInteger))];
  const exports = await TikTokCreatorPerformanceExport.findAll({
    where: { shop_id: { [Op.in]: shopIds }, module_type: 'VIDEO_API', status: 'SUCCEEDED' },
    attributes: ['id', 'shop_id', 'start_date', 'end_date', 'completed_at', 'created_at'],
    order: [['end_date', 'DESC'], ['completed_at', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
  });
  const selectedExportByShop = new Map();
  for (const record of exports) {
    const start = Date.parse(`${record.start_date}T00:00:00.000Z`);
    const end = Date.parse(`${record.end_date}T00:00:00.000Z`);
    if (Math.round((end - start) / 86400000) !== days || selectedExportByShop.has(Number(record.shop_id))) continue;
    selectedExportByShop.set(Number(record.shop_id), record);
  }
  const exportIds = [...selectedExportByShop.values()].map((record) => record.id);
  const videoIds = [...new Set(bookings.flatMap((booking) => (
    (booking.booking_videos || []).map((video) => String(video.platform_video_id))
  )))];
  const snapshots = exportIds.length && videoIds.length ? await TikTokVideoPerformanceSnapshot.findAll({
    where: { export_id: { [Op.in]: exportIds }, video_id: { [Op.in]: videoIds } },
  }) : [];
  const snapshotByExportAndVideo = new Map(snapshots.map((snapshot) => [
    `${snapshot.export_id}:${snapshot.video_id}`,
    snapshot,
  ]));
  for (const booking of bookings) {
    const exportRecord = selectedExportByShop.get(Number(booking.target_shop_id));
    const selectedIds = selectedProductIdsOfBooking(booking);
    for (const video of booking.booking_videos || []) {
      const snapshot = exportRecord
        ? snapshotByExportAndVideo.get(`${exportRecord.id}:${video.platform_video_id}`)
        : null;
      video.performance_snapshots = snapshot ? [{
        snapshot_date: exportRecord.end_date,
        ...metricOfAffiliateSnapshot(snapshot, selectedIds),
        synced_at: snapshot.synced_at || exportRecord.completed_at || exportRecord.created_at,
      }] : exportRecord ? [{
        snapshot_date: exportRecord.end_date,
        gross_gmv: 0,
        refunded_gmv: null,
        net_gmv: null,
        orders: 0,
        items_sold: 0,
        views: 0,
        ctr: null,
        currency: booking.currency || null,
        raw_metrics: {
          source: 'AFFILIATE_VIDEO_PERFORMANCE',
          metric_scope: 'SELECTED_BOOKING_PRODUCTS',
          selected_product_ids: [...selectedIds],
          no_activity_in_window: true,
        },
        synced_at: exportRecord.completed_at || exportRecord.created_at,
      }] : [];
    }
    booking.actual_performance = {
      ...calculateActualPerformance(booking),
      window_type: performanceWindow,
      start_date: exportRecord?.start_date || null,
      end_date: exportRecord?.end_date || null,
    };
  }
  return bookings;
};

const serializeBookingsWithFreshCreatorAvatars = async (bookings = []) => {
  const serialized = bookings.map(serializeBookingWithActual);
  const bookingsByShop = new Map();
  for (const booking of serialized) {
    const shopId = Number(booking.target_shop_id);
    if (!Number.isInteger(shopId)) continue;
    const rows = bookingsByShop.get(shopId) || [];
    rows.push(booking);
    bookingsByShop.set(shopId, rows);
  }

  await Promise.all([...bookingsByShop].map(async ([shopId, rows]) => {
    const profiles = await loadCreatorProfiles(shopId, rows.map((booking) => ({
      creator_open_id: booking.creator_open_id,
      username: booking.creator_username,
    })));
    for (const booking of rows) {
      const creatorOpenId = String(booking.creator_open_id || '').trim();
      const username = normalizedUsername(booking.creator_username);
      const profile = (creatorOpenId && profiles.get(`open:${creatorOpenId}`))
        || (username && profiles.get(`username:${username}`));
      const value = profile?.toJSON ? profile.toJSON() : profile;
      if (value?.avatar_url) booking.creator_avatar_url = value.avatar_url;
    }
  }));

  return filterBookingVideosBySelectedProducts(await hydrateBookingVideoProducts(serialized));
};

const normalizeBookingVideoUrl = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    if (!value.length) return null;
    return JSON.stringify(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const dateOnly = (value) => new Date(value).toISOString().slice(0, 10);
const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();
const tiktokVideoIdFromUrl = (value) => {
  const text = String(value || '').trim();
  if (!/^https?:\/\/(?:www\.)?tiktok\.com\//i.test(text)) return null;
  return text.match(/\/video\/(\d{10,30})(?:[/?#]|$)/i)?.[1] || null;
};
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
const normalizeVideoCandidate = (video) => {
  const id = String(video?.id || video?.video_id || '').trim();
  const username = videoUsername(video);
  const gmv = video?.gmv && typeof video.gmv === 'object'
    ? video.gmv
    : { amount: String(video?.gmv || 0), currency: null };
  return {
    id,
    title: String(video?.title || id || 'TikTok video'),
    username,
    posted_at: videoPostedAt(video),
    video_url: id && username ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${encodeURIComponent(id)}` : null,
    gmv: {
      amount: Number(gmv?.amount || 0),
      currency: gmv?.currency || null,
    },
    views: Number(video?.views ?? video?.video_views ?? 0),
    orders: Number(video?.sku_orders ?? video?.orders ?? 0),
    items_sold: Number(video?.items_sold ?? video?.units_sold ?? 0),
    ctr: Number(video?.click_through_rate ?? video?.ctr ?? 0),
    product_id: video?.product_id || null,
    products: Array.isArray(video?.products) ? video.products : [],
  };
};

const normalizeCachedVideoCandidate = (videoInstance) => {
  const video = typeof videoInstance?.toJSON === 'function' ? videoInstance.toJSON() : videoInstance;
  const latest = [...(video.performance_snapshots || [])].sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || {};
  return {
    id: String(video.platform_video_id),
    title: video.title || video.platform_video_id,
    username: normalizedUsername(video.creator_username),
    posted_at: video.posted_at || null,
    video_url: video.video_url || null,
    gmv: {
      amount: Number(latest.gross_gmv || 0),
      currency: latest.currency || null,
    },
    views: Number(latest.views || 0),
    orders: Number(latest.orders || 0),
    items_sold: Number(latest.items_sold || 0),
    ctr: Number(latest.ctr || 0),
    product_id: latest.raw_metrics?.product_id || video.raw_data?.product_id || null,
    products: [
      ...(Array.isArray(video.raw_data?.products) ? video.raw_data.products : []),
      ...(Array.isArray(latest.raw_metrics?.products) ? latest.raw_metrics.products : []),
    ],
    cached_catalog: true,
    catalog_synced_at: latest.synced_at || video.last_seen_at || null,
  };
};

const bookingVideoDateRange = (booking, now = new Date()) => {
  const earliest = new Date(now);
  earliest.setUTCDate(earliest.getUTCDate() - 89);
  const bookingDate = new Date(
    booking.evaluation_snapshot?.collaboration?.start_at
      || booking.created_at
      || booking.evaluation_snapshot?.recorded_at
      || earliest,
  );
  const start = bookingDate > earliest ? bookingDate : earliest;
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

const findBookingVideoCandidates = async (booking) => {
  const username = normalizedUsername(booking.creator_username);
  if (!username) {
    const error = new Error('Booking does not have a creator username for video matching.');
    error.status = 400;
    throw error;
  }
  if (!booking.target_shop_id) {
    const error = new Error('Booking is not linked to a TikTok Shop.');
    error.status = 400;
    throw error;
  }

  const shop = await TikTokShop.findByPk(booking.target_shop_id, {
    include: [{ association: 'authorization' }],
  });
  if (!shop?.authorization) {
    const error = new Error('TikTok Shop is not connected.');
    error.status = 409;
    throw error;
  }

  const range = bookingVideoDateRange(booking);
  if (ShopVideo?.findAll) {
    const cached = await ShopVideo.findAll({
      where: {
        shop_id: booking.target_shop_id,
        creator_username: { [Op.iLike]: username },
      },
      include: [{
        model: ShopVideoPerformanceSnapshot,
        as: 'performance_snapshots',
        required: false,
      }],
      order: [['posted_at', 'DESC']],
    });
    if (cached.length) {
      const normalized = cached.map(normalizeCachedVideoCandidate);
      const candidates = normalized.filter((candidate) => matchesBookingProducts(booking, candidate));
      const productDataComplete = normalized.every((candidate) => productIdsOfVideo(candidate).size > 0);
      if (candidates.length || productDataComplete) {
      return {
        candidates,
        range,
        source: 'SHOP_VIDEO_CATALOG',
      };
      }
    }
  }
  const videos = [];
  let pageToken = null;
  const configuredMaxPages = Number(process.env.BOOKING_VIDEO_MATCH_MAX_PAGES);
  const maxPages = Number.isInteger(configuredMaxPages)
    ? Math.min(500, Math.max(1, configuredMaxPages))
    : 200;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = isDemoAuthorization(shop.authorization)
      ? sellerAffiliateFixture('shop-video-performance', shop, {
        account_type: 'AFFILIATE_ACCOUNTS',
        currency: 'LOCAL',
      })
      : await getShopVideoPerformance({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        startDate: range.startDate,
        endDate: range.endDate,
        currency: 'LOCAL',
        accountType: 'AFFILIATE_ACCOUNTS',
        sortField: 'gmv',
        sortOrder: 'DESC',
        pageSize: 100,
        pageToken,
      });
    videos.push(...(payload.data?.videos || []));
    pageToken = payload.data?.next_page_token || null;
    if (!pageToken) break;
    if (page === maxPages - 1) {
      const error = new Error(`Booking video matching reached the safety limit of ${maxPages} pages before TikTok pagination ended.`);
      error.status = 424;
      throw error;
    }
  }

  const candidatesById = new Map();
  videos
    .filter((video) => videoUsername(video) === username)
    .map(normalizeVideoCandidate)
    .filter((video) => matchesBookingProducts(booking, video))
    .filter((video) => video.id)
    .forEach((video) => candidatesById.set(video.id, video));
  return {
    candidates: [...candidatesById.values()].sort((left, right) => (
      new Date(right.posted_at || 0) - new Date(left.posted_at || 0)
      || right.gmv.amount - left.gmv.amount
    )),
    range,
  };
};

const bookingInclude = [
  { model: User, as: 'staff' },
  { model: User, as: 'creator' },
  {
    model: BookingVideo,
    as: 'booking_videos',
    required: false,
    include: [{
      model: BookingVideoPerformanceSnapshot,
      as: 'performance_snapshots',
      required: false,
    }],
  },
];

const resolveSellerShopId = async (authorization, requestedShopId) => {
  const explicitShopId = String(requestedShopId || '').trim();
  if (explicitShopId) return explicitShopId;
  const sellerShop = await TikTokShop.findOne({ order: [['id', 'ASC']] });
  return String(sellerShop?.platform_shop_id || authorization?.shop_id || '').trim();
};

const canonicalCreatorKey = (shopId, creator = {}) => {
  const username = String(creator.username || '').trim().replace(/^@+/, '').toLowerCase();
  const creatorOpenId = String(creator.creator_open_id || '').trim();
  return username
    ? `${shopId}:username:${username}`
    : `${shopId}:open:${creatorOpenId}`;
};
const collaborationOption = (candidate) => candidate.collaboration_id ? {
  id: candidate.collaboration_id,
  name: candidate.collaboration_name,
  status: candidate.collaboration_status,
  start_at: candidate.collaboration_start_at,
  end_at: candidate.collaboration_end_at,
  products: candidate.products || [],
  synced_at: candidate.collaboration_synced_at || null,
} : null;
const mergeCreatorCandidates = (rows) => {
  const merged = new Map();
  for (const row of rows) {
    const key = canonicalCreatorKey(row.shop_id, row);
    const existing = merged.get(key);
    const collaboration = collaborationOption(row);
    if (!existing) {
      merged.set(key, {
        ...row,
        collaborations: collaboration ? [collaboration] : [],
      });
      continue;
    }
    if (collaboration && !existing.collaborations.some((item) => String(item.id) === String(collaboration.id))) {
      existing.collaborations.push(collaboration);
    }
    existing.performance ||= row.performance;
    existing.creator_open_id ||= row.creator_open_id;
    existing.nickname ||= row.nickname;
    existing.avatar_url ||= row.avatar_url;
  }
  return [...merged.values()];
};

const benchmarkPerformanceOrder = [
  [literal(`CASE "window_type" WHEN 'PAST_30_DAYS' THEN 0 WHEN 'PAST_7_DAYS' THEN 1 WHEN 'PAST_24H' THEN 2 ELSE 3 END`), 'ASC'],
  ['end_date', 'DESC'],
  ['synced_at', 'DESC'],
  ['id', 'DESC'],
];

const enrichPerformanceViews = async (performance) => {
  if (!performance) return performance;
  if (!sequelize?.query || !performance.shop_id || !performance.username) return performance;
  const periodDays = performance.window_type === 'PAST_7_DAYS' ? 7
    : performance.window_type === 'PAST_30_DAYS' ? 30 : null;
  if (!periodDays) return performance;
  const rows = await sequelize.query(`
    WITH latest_export AS (
      SELECT id
      FROM tiktok_creator_performance_exports
      WHERE shop_id = :shopId
        AND module_type = 'VIDEO_API'
        AND status = 'SUCCEEDED'
        AND end_date - start_date = :periodDays
      ORDER BY end_date DESC, created_at DESC, id DESC
      LIMIT 1
    )
    SELECT
      SUM(video.video_views)::bigint AS video_views,
      SUM(video.product_impressions)::bigint AS product_impressions,
      SUM(video.product_clicks)::bigint AS product_clicks
    FROM tiktok_video_performance_snapshots video
    JOIN latest_export export_record ON export_record.id = video.export_id
    WHERE LOWER(COALESCE(
      video.raw_metrics->'list'->'creator'->>'user_name',
      video.raw_metrics->'list'->>'username',
      ''
    )) = LOWER(:username)
  `, {
    replacements: {
      shopId: performance.shop_id,
      username: performance.username,
      periodDays,
    },
    type: QueryTypes.SELECT,
  });
  const videoMetrics = rows[0] || {};
  if (videoMetrics.video_views === null || videoMetrics.video_views === undefined) return performance;
  return {
    ...performance,
    video_views: videoMetrics.video_views,
    product_impressions: videoMetrics.product_impressions,
    product_clicks: videoMetrics.product_clicks,
    video_views_source: 'AFFILIATE_VIDEO_PERFORMANCE',
  };
};

const addReferencePerformance = async (bookings, performanceWindow, customRange = {}) => {
  if (!BOOKING_PERFORMANCE_WINDOWS.has(performanceWindow) || !bookings.length) return bookings;
  const creatorConditions = bookings.map((booking) => ({
    shop_id: Number(booking.target_shop_id),
    [Op.or]: [
      ...(booking.creator_open_id ? [{ creator_open_id: booking.creator_open_id }] : []),
      ...(booking.creator_username ? [{ username: { [Op.iLike]: normalizedUsername(booking.creator_username) } }] : []),
    ],
  })).filter((condition) => Number.isInteger(condition.shop_id) && condition[Op.or].length);
  const aggregateDays = Number(performanceWindow.match(/^PAST_(\d+)_DAYS$/)?.[1]);
  const isCustomRange = performanceWindow === 'CUSTOM'
    && customRange.startDate
    && customRange.endDate
    && customRange.requestedDays;
  const shopIds = [...new Set(bookings.map((booking) => Number(booking.target_shop_id)).filter(Number.isInteger))];
  const customCoverageRows = isCustomRange && shopIds.length ? await sequelize.query(`
    WITH latest_daily_exports AS (
      SELECT shop_id, start_date,
        ROW_NUMBER() OVER (
          PARTITION BY shop_id, start_date
          ORDER BY created_at DESC, id DESC
        ) AS version_rank
      FROM tiktok_creator_performance_exports
      WHERE shop_id IN (:shopIds)
        AND module_type = 'CREATOR'
        AND window_type = 'PAST_24H'
        AND plan_type = 'ALL'
        AND status = 'SUCCEEDED'
        AND start_date = end_date
        AND start_date BETWEEN :customStartDate AND :customEndDate
    )
    SELECT shop_id, COUNT(*)::integer AS available_days
    FROM latest_daily_exports
    WHERE version_rank = 1
    GROUP BY shop_id
  `, {
    replacements: {
      shopIds,
      customStartDate: customRange.startDate,
      customEndDate: customRange.endDate,
    },
    type: QueryTypes.SELECT,
  }) : [];
  const coverageByShop = new Map(customCoverageRows.map((row) => {
    const availableDays = Number(row.available_days) || 0;
    return [Number(row.shop_id), {
      start_date: customRange.startDate,
      end_date: customRange.endDate,
      requested_days: customRange.requestedDays,
      available_days: availableDays,
      complete: availableDays === customRange.requestedDays,
    }];
  }));
  const snapshots = !creatorConditions.length
    ? []
    : AGGREGATE_BOOKING_WINDOW_DAYS.has(aggregateDays) || isCustomRange
      ? await sequelize.query(`
        WITH export_versions AS (
          SELECT export_record.*,
            ROW_NUMBER() OVER (
              PARTITION BY shop_id, start_date, end_date
              ORDER BY created_at DESC, id DESC
            ) AS version_rank
          FROM tiktok_creator_performance_exports export_record
          WHERE shop_id IN (:shopIds)
            AND module_type = 'CREATOR'
            AND window_type = :sourceWindow
            AND plan_type = 'ALL'
            AND status = 'SUCCEEDED'
            ${isCustomRange ? `
              AND start_date = end_date
              AND start_date BETWEEN :customStartDate AND :customEndDate
            ` : ''}
        ), ranked_periods AS (
          SELECT export_versions.*,
            DENSE_RANK() OVER (
              PARTITION BY shop_id
              ORDER BY end_date DESC, start_date DESC
            ) AS period_rank
          FROM export_versions
          WHERE version_rank = 1
        ), source AS (
          SELECT snapshot.*
          FROM tiktok_creator_performance_snapshots snapshot
          JOIN ranked_periods period ON period.id = snapshot.export_id
          ${isCustomRange ? '' : 'WHERE period.period_rank <= :periodCount'}
        )
        SELECT
          source.shop_id,
          MAX(source.creator_open_id) AS creator_open_id,
          LOWER(source.username) AS username,
          MAX(source.nickname) AS nickname,
          MAX(source.avatar_url) AS avatar_url,
          MIN(source.start_date) AS start_date,
          MAX(source.end_date) AS end_date,
          :performanceWindow AS window_type,
          source.currency,
          SUM(source.affiliate_gmv) AS affiliate_gmv,
          SUM(source.refunded_gmv) AS refunded_gmv,
          SUM(source.affiliate_orders) AS affiliate_orders,
          SUM(source.items_sold) AS items_sold,
          SUM(source.items_refunded) AS items_refunded,
          CASE
            WHEN SUM(source.affiliate_orders) > 0
              THEN SUM(source.affiliate_gmv) / SUM(source.affiliate_orders)
            ELSE 0
          END AS average_order_value,
          SUM(source.live_streams) AS live_streams,
          SUM(source.shoppable_videos) AS shoppable_videos,
          SUM(source.samples_shipped) AS samples_shipped,
          SUM(source.estimated_commission) AS estimated_commission,
          CASE WHEN COUNT(source.video_views) = COUNT(*) THEN SUM(source.video_views) ELSE NULL END AS video_views,
          NOW() AS synced_at
        FROM source
        GROUP BY source.shop_id, LOWER(source.username), source.currency
      `, {
        replacements: {
          shopIds,
          performanceWindow,
          sourceWindow: isCustomRange ? 'PAST_24H' : 'PAST_30_DAYS',
          ...(isCustomRange
            ? {
              customStartDate: customRange.startDate,
              customEndDate: customRange.endDate,
            }
            : { periodCount: aggregateDays / 30 }),
        },
        type: QueryTypes.SELECT,
      })
      : await TikTokCreatorPerformanceSnapshot.findAll({
      where: {
        window_type: performanceWindow,
        [Op.or]: creatorConditions,
      },
      order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
    });
  const performanceByCreator = new Map();
  for (const snapshot of snapshots) {
    const performance = snapshot.toJSON ? snapshot.toJSON() : snapshot;
    const shopId = Number(performance.shop_id);
    const keys = [
      performance.creator_open_id ? `${shopId}:open:${performance.creator_open_id}` : null,
      performance.username ? `${shopId}:username:${normalizedUsername(performance.username)}` : null,
    ].filter(Boolean);
    for (const key of keys) {
      if (!performanceByCreator.has(key)) performanceByCreator.set(key, performance);
    }
  }
  const enrichedByCreator = new Map();
  return Promise.all(bookings.map(async (booking) => {
    const shopId = Number(booking.target_shop_id);
    const keys = [
      booking.creator_open_id ? `${shopId}:open:${booking.creator_open_id}` : null,
      booking.creator_username ? `${shopId}:username:${normalizedUsername(booking.creator_username)}` : null,
    ].filter(Boolean);
    const key = keys.find((candidate) => performanceByCreator.has(candidate));
    const referencePerformanceCoverage = isCustomRange
      ? coverageByShop.get(shopId) || {
        start_date: customRange.startDate,
        end_date: customRange.endDate,
        requested_days: customRange.requestedDays,
        available_days: 0,
        complete: false,
      }
      : undefined;
    if (!key) return {
      ...booking,
      reference_performance: null,
      ...(isCustomRange ? { reference_performance_coverage: referencePerformanceCoverage } : {}),
    };
    if (!enrichedByCreator.has(key)) {
      enrichedByCreator.set(key, enrichPerformanceViews(performanceByCreator.get(key)));
    }
    return {
      ...booking,
      reference_performance: await enrichedByCreator.get(key),
      ...(isCustomRange ? { reference_performance_coverage: referencePerformanceCoverage } : {}),
    };
  }));
};

const targetKocPageParams = (query = {}) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedPageSize = Number.parseInt(query.page_size, 10);
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: Number.isInteger(requestedPageSize)
      ? Math.min(100, Math.max(1, requestedPageSize))
      : 20,
  };
};

const getTargetKocs = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const { page, pageSize } = targetKocPageParams(req.query);
    const rows = await sequelize.query(`
      WITH collaboration_creators AS (
        SELECT
          collaboration.shop_id,
          NULLIF(COALESCE(
            creator ->> 'creator_open_id',
            creator ->> 'creator_user_open_id',
            creator ->> 'user_id'
          ), '') AS creator_open_id,
          NULLIF(LOWER(REGEXP_REPLACE(TRIM(creator ->> 'username'), '^@+', '')), '') AS username,
          NULLIF(creator ->> 'nickname', '') AS nickname,
          NULLIF(COALESCE(creator ->> 'avatar_url', creator #>> '{avatar,url}'), '') AS avatar_url,
          collaboration.collaboration_id,
          collaboration.name AS collaboration_name,
          collaboration.end_at,
          1 AS source_priority
        FROM tiktok_target_collaboration_snapshots collaboration
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(collaboration.raw_data -> 'creators') = 'array'
              THEN collaboration.raw_data -> 'creators'
            ELSE '[]'::jsonb
          END
        ) creator
        WHERE collaboration.status IN ('ONGOING', 'VALID', 'EXPIRING')
      ),
      ranked_performance AS (
        SELECT
          snapshot.shop_id,
          NULLIF(snapshot.creator_open_id, '') AS creator_open_id,
          NULLIF(LOWER(REGEXP_REPLACE(TRIM(snapshot.username), '^@+', '')), '') AS username,
          NULLIF(snapshot.nickname, '') AS nickname,
          NULLIF(snapshot.avatar_url, '') AS avatar_url,
          ROW_NUMBER() OVER (
            PARTITION BY shop_id, COALESCE(NULLIF(creator_open_id, ''), LOWER(username))
            ORDER BY
              CASE window_type WHEN 'PAST_30_DAYS' THEN 0 WHEN 'PAST_7_DAYS' THEN 1 WHEN 'PAST_24H' THEN 2 ELSE 3 END,
              end_date DESC, synced_at DESC, id DESC
          ) AS benchmark_rank
        FROM tiktok_creator_performance_snapshots snapshot
        WHERE snapshot.window_type IN ('PAST_30_DAYS', 'PAST_7_DAYS', 'PAST_24H')
      ),
      candidates AS (
        SELECT * FROM collaboration_creators
        UNION ALL
        SELECT
          shop_id, creator_open_id, username, nickname, avatar_url,
          NULL::varchar AS collaboration_id,
          NULL::varchar AS collaboration_name,
          NULL::timestamptz AS end_at,
          0 AS source_priority
        FROM ranked_performance
        WHERE benchmark_rank = 1
      ),
      grouped AS (
        SELECT
          shop_id,
          COALESCE(username, 'open:' || creator_open_id) AS identity,
          (ARRAY_AGG(creator_open_id ORDER BY source_priority DESC, end_at DESC NULLS LAST)
            FILTER (WHERE creator_open_id IS NOT NULL))[1] AS creator_open_id,
          (ARRAY_AGG(username ORDER BY source_priority DESC, end_at DESC NULLS LAST)
            FILTER (WHERE username IS NOT NULL))[1] AS username,
          (ARRAY_AGG(nickname ORDER BY source_priority DESC, end_at DESC NULLS LAST)
            FILTER (WHERE nickname IS NOT NULL))[1] AS nickname,
          (ARRAY_AGG(avatar_url ORDER BY source_priority DESC, end_at DESC NULLS LAST)
            FILTER (WHERE avatar_url IS NOT NULL))[1] AS avatar_url,
          COUNT(DISTINCT collaboration_id)::integer AS collaboration_count,
          STRING_AGG(DISTINCT collaboration_name, ' ') AS collaboration_names
        FROM candidates
        WHERE username IS NOT NULL OR creator_open_id IS NOT NULL
        GROUP BY shop_id, COALESCE(username, 'open:' || creator_open_id)
      ),
      filtered AS (
        SELECT *
        FROM grouped
        WHERE :keyword = ''
          OR CONCAT_WS(' ', nickname, username, collaboration_names) ILIKE '%' || :keyword || '%'
      )
      SELECT
        shop_id,
        creator_open_id,
        username,
        nickname,
        avatar_url,
        collaboration_count,
        COUNT(*) OVER()::integer AS total_count
      FROM filtered
      ORDER BY collaboration_count DESC, COALESCE(nickname, username) ASC, shop_id ASC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: {
        keyword,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
      type: QueryTypes.SELECT,
    });
    const total = Number(rows[0]?.total_count || 0);
    res.json({
      items: rows.map((row) => ({
        shop_id: Number(row.shop_id),
        creator_open_id: row.creator_open_id || null,
        username: row.username || null,
        nickname: row.nickname || null,
        avatar_url: row.avatar_url || null,
        collaboration_count: Number(row.collaboration_count || 0),
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const findTargetCreator = async (
  shopId,
  collaborationIdValue,
  creatorOpenIdValue,
  creatorUsernameValue,
  performanceWindowValue,
) => {
  const normalizedShopId = Number(shopId);
  const collaborationId = String(collaborationIdValue || '').trim();
  const creatorOpenId = String(creatorOpenIdValue || '').trim();
  const creatorUsername = String(creatorUsernameValue || '').trim();
  const requestedPerformanceWindow = String(performanceWindowValue || '').trim().toUpperCase();
  const performanceWindow = BOOKING_PERFORMANCE_WINDOWS.has(requestedPerformanceWindow)
    ? requestedPerformanceWindow
    : null;
  if (!Number.isInteger(normalizedShopId) || (!creatorOpenId && !creatorUsername)) return null;

  const collaborationSnapshots = collaborationId
    ? [await TikTokTargetCollaborationSnapshot.findOne({
      where: { shop_id: normalizedShopId, collaboration_id: collaborationId },
    })].filter(Boolean)
    : await (TikTokTargetCollaborationSnapshot.findAll?.({
      where: {
        shop_id: normalizedShopId,
        status: { [Op.in]: ['ONGOING', 'VALID', 'EXPIRING'] },
      },
      order: [['end_at', 'DESC'], ['synced_at', 'DESC']],
    }) || []);

  for (const snapshot of collaborationSnapshots) {
    if (snapshot) {
      const collaboration = snapshot.toJSON();
      const raw = collaboration.raw_data || {};
      const creator = (raw.creators || []).find((item) => {
        const profile = normalizeCreatorProfile(item);
        return (creatorOpenId && String(profile.creator_open_id || '') === creatorOpenId)
          || (creatorUsername && String(profile.username || '').toLowerCase() === creatorUsername.toLowerCase());
      });
      if (creator) {
        const profile = normalizeCreatorProfile(creator);
        const performance = await TikTokCreatorPerformanceSnapshot.findOne({
          where: {
            shop_id: normalizedShopId,
            window_type: performanceWindow || { [Op.in]: ['PAST_30_DAYS', 'PAST_7_DAYS', 'PAST_24H'] },
            [Op.or]: [
              ...(profile.creator_open_id ? [{ creator_open_id: profile.creator_open_id }] : []),
              ...(profile.username ? [{ username: { [Op.iLike]: profile.username } }] : []),
            ],
          },
          order: benchmarkPerformanceOrder,
        });
        const performanceData = performance?.toJSON() || null;
        return {
          shopId: normalizedShopId,
          collaboration,
          raw,
          profile,
          performance: await enrichPerformanceViews(performanceData),
        };
      }
    }
  }

  const creatorConditions = [
    ...(creatorOpenId ? [{ creator_open_id: creatorOpenId }] : []),
    ...(creatorUsername ? [{ username: { [Op.iLike]: creatorUsername } }] : []),
  ];
  const profilePerformance = await TikTokCreatorPerformanceSnapshot.findOne({
    where: {
      shop_id: normalizedShopId,
      window_type: { [Op.in]: ['PAST_30_DAYS', 'PAST_7_DAYS', 'PAST_24H'] },
      [Op.or]: creatorConditions,
    },
    order: benchmarkPerformanceOrder,
  });
  if (!profilePerformance) return null;
  const profilePerformanceData = profilePerformance.toJSON();
  const selectedPerformance = performanceWindow
    ? await TikTokCreatorPerformanceSnapshot.findOne({
      where: {
        shop_id: normalizedShopId,
        window_type: performanceWindow,
        [Op.or]: creatorConditions,
      },
      order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
    })
    : profilePerformance;
  const performanceData = selectedPerformance?.toJSON() || null;
  return {
    shopId: normalizedShopId,
    collaboration: null,
    raw: null,
    profile: {
      creator_open_id: profilePerformanceData.creator_open_id || null,
      username: profilePerformanceData.username,
      nickname: profilePerformanceData.nickname || profilePerformanceData.username,
      avatar_url: profilePerformanceData.avatar_url || null,
    },
    performance: await enrichPerformanceViews(performanceData),
  };
};

const getTargetKocDetail = async (req, res) => {
  try {
    const targetCreator = await findTargetCreator(
      req.query.shop_id,
      req.query.collaboration_id,
      req.query.creator_open_id,
      req.query.username,
      req.query.window_type,
    );
    if (!targetCreator) {
      return res.status(404).json({ message: 'Target KOC not found.' });
    }
    const { shopId, collaboration, raw, profile, performance } = targetCreator;
    res.json({
      shop_id: Number(shopId),
      creator_open_id: profile.creator_open_id || null,
      username: profile.username || null,
      nickname: profile.nickname || null,
      avatar_url: profile.avatar_url || null,
      collaboration_id: collaboration?.collaboration_id || null,
      collaboration_name: collaboration?.name || null,
      collaboration_status: collaboration?.status || null,
      collaboration_start_at: collaboration?.start_at || null,
      collaboration_end_at: collaboration?.end_at || null,
      products: Array.isArray(raw?.products) ? raw.products : [],
      performance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBookings = async (req, res) => {
  try {
    const requestedWindow = String(req.query?.window_type || '').trim().toUpperCase();
    const startDate = String(req.query?.start_date || '').trim();
    const endDate = String(req.query?.end_date || '').trim();
    const customRange = requestedWindow === 'CUSTOM'
      ? customPerformanceRange(startDate, endDate)
      : {};
    if (requestedWindow === 'CUSTOM' && !customRange) {
      return res.status(400).json({
        message: `Custom dates must be valid, end no later than yesterday, and span at most ${MAX_CUSTOM_PERFORMANCE_DAYS} days.`,
      });
    }

    const cacheKey = `bookings:list:${requestedWindow || 'default'}:${startDate || 'none'}:${endDate || 'none'}`;
    const { data: payload, hit } = await getOrSetCache(cacheKey, 120, async () => {
      const bookings = await Booking.findAll({
        where: { evaluation_snapshot: { [Op.not]: null } },
        include: bookingInclude,
        order: [['deadline', 'ASC'], ['id', 'DESC']],
      });
      const serialized = await applyBookingVideoPerformanceWindow(
        await serializeBookingsWithFreshCreatorAvatars(bookings),
        requestedWindow,
      );
      return addReferencePerformance(serialized, requestedWindow, customRange);
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    const [serialized] = await serializeBookingsWithFreshCreatorAvatars([booking]);
    res.json(serialized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const cost = Number(req.body.total_cost ?? req.body.booking_cost);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Total cost must be zero or greater.' });
    const canManageUsers = !req.session
      || req.session.role === 'admin'
      || (Array.isArray(req.session.permissions) && req.session.permissions.includes('users'));
    const requestedStaffId = canManageUsers
      ? (req.body.staff_id === undefined || req.body.staff_id === null || req.body.staff_id === ''
        ? null
        : Number(req.body.staff_id))
      : req.session ? req.session.sub : null;
    if (requestedStaffId !== null && !Number.isInteger(requestedStaffId)) {
      return res.status(400).json({ message: 'Select a valid managing user.' });
    }
    const staff = requestedStaffId === null ? null : await User.findByPk(requestedStaffId, { attributes: ['id', 'name'] });
    if (requestedStaffId !== null && !staff) return res.status(400).json({ message: 'Managing user not found.' });
    const targetCreator = await findTargetCreator(
      req.body.target_shop_id,
      req.body.target_collaboration_id,
      req.body.creator_open_id,
      req.body.creator_username,
      req.body.performance_window_type,
    );
    if (!targetCreator) return res.status(400).json({ message: 'Select a KOC from synced Target Collaboration or Creator Performance data.' });
    const { shopId, collaboration, raw, profile, performance } = targetCreator;
    const selectedProducts = normalizeBookingProducts(req.body.products, req.body.product_ids);
    const evaluationSnapshot = {
      recorded_at: new Date().toISOString(),
      products: selectedProducts,
      product_ids: selectedProducts.map((product) => product.id),
      collaboration: collaboration ? {
        id: collaboration.collaboration_id,
        name: collaboration.name,
        status: collaboration.status,
        start_at: collaboration.start_at,
        end_at: collaboration.end_at,
        products: Array.isArray(raw.products) ? raw.products : [],
        synced_at: collaboration.synced_at,
      } : null,
      performance,
    };
    const payload = compactPayload({
      staff_id: staff?.id || null,
      staff_name: staff?.name || null,
      creator_id: null,
      creator_open_id: profile.creator_open_id,
      creator_username: profile.username,
      creator_name: profile.nickname,
      creator_avatar_url: profile.avatar_url,
      target_shop_id: shopId,
      target_collaboration_id: collaboration?.collaboration_id || null,
      evaluation_snapshot: evaluationSnapshot,
      booking_cost: cost,
      total_cost: cost,
      cost_note: String(req.body.cost_note || '').trim() || null,
      currency: String(req.body.currency || performance?.currency || 'MYR').trim().toUpperCase(),
      status: 'draft',
      deadline: collaboration?.end_at ? new Date(collaboration.end_at).toISOString().slice(0, 10) : null,
      note: req.body.note || null,
      updated_at: new Date(),
    });

    if (!ALLOWED_STATUSES.has(payload.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const booking = await Booking.create(payload);
    await Promise.all([
      delByPattern('bookings:*'),
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
    ]).catch(() => {});

    await upsertShopProducts(shopId, selectedProducts).catch((error) => {
      console.warn(`Unable to cache product thumbnails for booking ${booking.id}: ${error.message}`);
    });
    try {
      await autoLinkBookingVideos(booking);
    } catch (error) {
      console.warn(`Unable to auto-link Affiliate videos for booking ${booking.id}: ${error.message}`);
    }
    const createdBooking = await Booking.findByPk(booking.id, { include: bookingInclude });
    const [serialized] = await serializeBookingsWithFreshCreatorAvatars([createdBooking]);
    res.status(201).json(serialized);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    if (req.body.total_cost !== undefined || req.body.booking_cost !== undefined) {
      const cost = Number(req.body.total_cost ?? req.body.booking_cost);
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Total cost must be zero or greater.' });
      req.body.total_cost = cost;
      req.body.booking_cost = cost;
    }
    if (req.body.status && !ALLOWED_STATUSES.has(req.body.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    let updatedEvaluationSnapshot;
    let updatedProducts = null;
    if (req.body.products !== undefined || req.body.product_ids !== undefined) {
      const currentBooking = await Booking.findByPk(req.params.id);
      if (!currentBooking) return res.status(404).json({ message: 'Booking not found' });
      const current = currentBooking.toJSON ? currentBooking.toJSON() : currentBooking;
      const selectedProducts = normalizeBookingProducts(req.body.products, req.body.product_ids);
      updatedProducts = selectedProducts;
      updatedEvaluationSnapshot = {
        ...(current.evaluation_snapshot || {}),
        products: selectedProducts,
        product_ids: selectedProducts.map((product) => product.id),
      };
    }

    const payload = compactPayload({
      staff_id: req.body.staff_id,
      staff_name: req.body.staff_name === undefined ? undefined : String(req.body.staff_name || '').trim(),
      creator_id: req.body.creator_id,
      booking_cost: req.body.booking_cost,
      total_cost: req.body.total_cost,
      cost_note: req.body.cost_note === undefined ? undefined : String(req.body.cost_note || '').trim() || null,
      currency: req.body.currency === undefined ? undefined : String(req.body.currency || 'MYR').trim().toUpperCase(),
      status: req.body.status,
      deadline: req.body.deadline,
      note: req.body.note,
      video_platform_id: req.body.video_platform_id,
      video_url: normalizeBookingVideoUrl(req.body.video_url),
      posted_at: req.body.posted_at,
      evaluation_snapshot: updatedEvaluationSnapshot,
      updated_at: new Date(),
    });

    const [updated] = await Booking.update(payload, {
      where: { id: req.params.id },
      individualHooks: true,
      validate: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    await Promise.all([
      delByPattern('bookings:*'),
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
    ]).catch(() => {});

    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    if (updatedProducts) {
      await upsertShopProducts(booking.target_shop_id, updatedProducts).catch((error) => {
        console.warn(`Unable to cache product thumbnails for booking ${booking.id}: ${error.message}`);
      });
    }
    const [serialized] = await serializeBookingsWithFreshCreatorAvatars([booking]);
    res.json(serialized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const matchBookingVideo = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const manualVideoUrl = String(req.body?.video_url || '').trim();
    const manualVideoId = manualVideoUrl ? tiktokVideoIdFromUrl(manualVideoUrl) : null;
    if (manualVideoUrl && !manualVideoId) {
      return res.status(400).json({ message: 'Enter a valid TikTok video URL.' });
    }
    const { candidates, range } = manualVideoId
      ? { candidates: [], range: bookingVideoDateRange(booking) }
      : await findBookingVideoCandidates(booking);
    const requestedVideoId = String(req.body?.video_id || manualVideoId || booking.video_platform_id || '').trim();
    let selected = requestedVideoId
      ? candidates.find((candidate) => candidate.id === requestedVideoId)
      : candidates.length === 1 ? candidates[0] : null;
    if (!selected && manualVideoId) {
      selected = {
        id: manualVideoId,
        title: 'TikTok video',
        username: normalizedUsername(booking.creator_username),
        posted_at: null,
        video_url: manualVideoUrl,
        gmv: { amount: 0, currency: null },
        views: 0,
        orders: 0,
        items_sold: 0,
        ctr: 0,
        manually_confirmed: true,
      };
    }

    if (!selected) {
      return res.json({
        status: requestedVideoId ? 'no_match' : candidates.length ? 'needs_confirmation' : 'no_match',
        candidates: requestedVideoId ? [] : candidates,
        range,
      });
    }

    const mappingSource = selected.manually_confirmed
      ? 'MANUAL_URL'
      : selected.cached_catalog ? 'SHOP_VIDEO_CATALOG' : 'TIKTOK_SHOP_VIDEO_PERFORMANCE';
    const evaluationSnapshot = {
      ...booking.evaluation_snapshot,
      video_match: {
        source: mappingSource,
        matched_at: new Date().toISOString(),
        ...selected,
      },
    };
    await booking.update({
      video_platform_id: selected.id,
      video_url: selected.video_url,
      posted_at: selected.posted_at,
      evaluation_snapshot: evaluationSnapshot,
      updated_at: new Date(),
    });
    const linkedVideo = await recordBookingVideoMatch(
      booking,
      selected,
      mappingSource,
    );
    let syncWarning = null;
    if (linkedVideo && (selected.cached_catalog || selected.manually_confirmed)) {
      linkedVideo.booking = booking;
      await syncBookingVideo(linkedVideo).catch((syncError) => {
        syncWarning = syncError.message;
      });
    }
    const updated = await Booking.findByPk(booking.id, { include: bookingInclude });
    const [serialized] = await serializeBookingsWithFreshCreatorAvatars([updated]);
    return res.json({
      status: 'matched',
      booking: serialized,
      candidate: selected,
      range,
      ...(syncWarning ? { sync_warning: syncWarning } : {}),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const deleted = await Booking.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    await Promise.all([
      delByPattern('bookings:*'),
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
    ]).catch(() => {});

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTikTokPartnerCollaborations = async (req, res) => {
  try {
    const creatorId = Number(req.query.creator_id);
    if (!Number.isInteger(creatorId)) return res.status(400).json({ message: 'creator_id is required.' });
    const authorization = await TikTokPartnerAuthorization.findOne({ where: { creator_id: creatorId } });
    if (!authorization) return res.status(409).json({ message: 'This KOC has not connected TikTok Partner.' });
    const shopId = await resolveSellerShopId(authorization, req.query.shop_id);
    const result = isDemoAuthorization(authorization)
      ? creatorCollaborationsFixture(authorization)
      : await searchTargetCollaborations({
        authorization,
        shopId,
        pageToken: req.query.page_token,
        pageSize: req.query.page_size,
        keyword: req.query.keyword,
      });
    res.json(result);
  } catch (error) {
    const status = error.message.startsWith('TikTok Partner is not configured') ? 503 : 502;
    res.status(status).json({ message: error.message });
  }
};

const getTikTokPartnerStatuses = async (req, res) => {
  try {
    const creators = await User.findAll({
      where: { role: 'koc' },
      include: [{ model: TikTokPartnerAuthorization, as: 'tiktok_partner_authorization', required: false }],
      order: [['name', 'ASC']],
    });
    res.json(creators.map((creator) => {
      const authorization = creator.tiktok_partner_authorization;
      const grantedScopes = grantedScopesOf(authorization);
      const refreshExpiresAt = authorization?.refresh_token_expires_at
        ? new Date(authorization.refresh_token_expires_at).getTime()
        : null;
      const tokenExpired = Boolean(authorization && refreshExpiresAt && refreshExpiresAt <= Date.now());
      return {
        creator_id: creator.id,
        connected: Boolean(authorization),
        open_id: authorization?.open_id || null,
        status: !authorization ? 'disconnected' : (tokenExpired ? 'expired' : 'connected'),
        username: authorization?.username || null,
        avatar_url: authorization?.avatar_url || null,
        register_region: authorization?.register_region || null,
        showcase_count: authorization?.showcase_count || 0,
        last_synced_at: authorization?.last_synced_at || null,
        last_sync_status: authorization?.last_sync_status || null,
        last_sync_error: authorization?.last_sync_error || null,
        granted_scopes: grantedScopes,
        access_token_expires_at: authorization?.access_token_expires_at || null,
        connected_at: authorization?.connected_at || null,
      };
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const startTikTokPartnerOauth = async (req, res) => {
  try {
    const creatorId = Number(req.query.creator_id);
    const createKoc = req.query.create_koc === 'true';
    if (createKoc && Number.isInteger(creatorId)) return res.status(400).json({ message: 'Choose either an existing KOC or create a new KOC, not both.' });
    if (!createKoc) {
      if (!Number.isInteger(creatorId) || creatorId <= 0) return res.status(400).json({ message: 'creator_id is required when connecting an existing KOC.' });
      const creator = await User.findOne({ where: { id: creatorId, role: 'koc' }, attributes: ['id'] });
      if (!creator) return res.status(404).json({ message: 'KOC not found.' });
    }
    res.json({ authorizeUrl: buildAuthorizationUrl({
      returnPath: req.query.return_path,
      creatorId: createKoc ? null : creatorId,
      createKoc,
    }) });
  } catch (error) {
    const status = error.message.startsWith('TikTok Partner is not configured') ? 503 : 500;
    res.status(status).json({ message: error.message });
  }
};

const buildPartnerReturnUrl = (status, message, creatorId, returnPath = '/bookings') => {
  const safeReturnPath = ['/bookings', '/manage/koc-performance'].includes(returnPath) ? returnPath : '/bookings';
  const url = new URL(safeReturnPath, process.env.FRONTEND_URL || 'http://localhost:3005');
  url.searchParams.set('partner_oauth_status', status);
  if (message) url.searchParams.set('partner_oauth_message', message);
  if (creatorId) url.searchParams.set('creator_id', String(creatorId));
  return url.toString();
};

const handleTikTokPartnerOauthCallback = async (req, res) => {
  let creatorId;
  let returnPath = '/bookings';
  try {
    const state = parseAuthorizationState(req.query.state);
    if (state.oauthType === 'shop') return handleShopOauthCallback(req, res);
    if (state.oauthType && state.oauthType !== 'creator') throw new Error('TikTok OAuth state has an unsupported authorization type.');
    returnPath = state.returnPath;
    const targetCreatorId = Number(state.creator_id ?? state.creatorId);
    const createKoc = (state.create_koc ?? state.createKoc) === true;
    if ((!Number.isInteger(targetCreatorId) || targetCreatorId <= 0) && !createKoc) {
      throw new Error('TikTok Creator authorization is not linked to a KOC. Start the connection again.');
    }
    if (!req.query.code || req.query.code === 'null') throw new Error(req.query.error || 'Creator denied TikTok authorization.');
    const tokenData = await exchangeAuthorizationCode(req.query.code);
    if (Number(tokenData.user_type) !== 1) throw new Error('TikTok authorization must return a Creator token (user_type=1).');
    const scopes = tokenData.granted_scopes || tokenData.granted_permissions || [];
    const normalizedScopes = Array.isArray(scopes) ? scopes : String(scopes).split(',').map((item) => item.trim()).filter(Boolean);
    if (!normalizedScopes.includes(CREATOR_PROFILE_SCOPE)) {
      throw new Error(`Creator did not grant ${CREATOR_PROFILE_SCOPE}.`);
    }
    const profile = await getCreatorProfileWithAccessToken(tokenData.access_token);
    const openId = profile.creator_user_open_id || tokenData.open_id;
    if (!openId) throw new Error('TikTok Creator profile did not return an open ID.');
    const existingByOpenId = await TikTokPartnerAuthorization.findOne({ where: { open_id: openId } });
    const existingByCreator = Number.isInteger(targetCreatorId)
      ? await TikTokPartnerAuthorization.findOne({ where: { creator_id: targetCreatorId } })
      : null;
    if (existingByOpenId && Number.isInteger(targetCreatorId) && existingByOpenId.creator_id !== targetCreatorId) {
      throw new Error('This TikTok Creator is already linked to another KOC.');
    }
    let creator = Number.isInteger(targetCreatorId)
      ? await User.findOne({ where: { id: targetCreatorId, role: 'koc' } })
      : existingByOpenId ? await User.findByPk(existingByOpenId.creator_id) : null;
    if (!creator && createKoc) {
      const identifier = crypto.createHash('sha256').update(openId).digest('hex').slice(0, 24);
      creator = await User.create({
        name: profile.username || `TikTok Creator ${openId.slice(-6)}`,
        email: `tiktok.${identifier}@creators.yumnetwork.vn`,
        role: 'koc',
      });
    }
    if (!creator) throw new Error('The selected KOC no longer exists.');
    creatorId = creator.id;
    const existing = existingByCreator || existingByOpenId;
    const sellerShopId = await resolveSellerShopId(existing);
    const values = {
      creator_id: creatorId,
      shop_id: sellerShopId || null,
      connected_at: new Date(),
      username: profile.username || existing?.username || null,
      avatar_url: profile.avatar?.url || profile.avatar_url || existing?.avatar_url || null,
      register_region: profile.register_region || existing?.register_region || null,
      last_synced_at: new Date(),
      last_sync_status: 'success',
      last_sync_error: null,
      ...tokenFields({ ...tokenData, open_id: openId, granted_scopes: normalizedScopes }, existing || {}),
    };
    let authorization;
    if (existing) {
      authorization = existing;
      await authorization.update(values);
    } else {
      authorization = await TikTokPartnerAuthorization.create(values);
    }
    await sequelize.query(`
      INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, synced_at)
      VALUES (:authorizationId, :creatorId, 'success', NOW())
    `, { replacements: { authorizationId: authorization.id, creatorId } });
    return res.redirect(buildPartnerReturnUrl('success', 'TikTok Creator connected.', creatorId, returnPath));
  } catch (error) {
    console.error('[TikTok Partner OAuth] Callback failed', { creatorId, message: error.message });
    return res.redirect(buildPartnerReturnUrl('error', error.message || 'TikTok Partner OAuth failed.', creatorId, returnPath));
  }
};

const getTikTokPartnerCreatorOverview = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    const authorization = Number.isInteger(creatorId)
      ? await TikTokPartnerAuthorization.findOne({ where: { creator_id: creatorId } })
      : null;
    if (!authorization) return res.status(409).json({ message: 'This KOC has not connected TikTok Partner.' });
    const shopId = await resolveSellerShopId(authorization);
    const overview = isDemoAuthorization(authorization)
      ? creatorOverviewFixture(authorization)
      : await getCreatorOverview(authorization, { shopId });
    await authorization.update({
      username: overview.profile?.username || authorization.username,
      avatar_url: overview.profile?.avatar?.url || overview.profile?.avatar_url || authorization.avatar_url,
      register_region: overview.profile?.register_region || authorization.register_region,
      showcase_count: overview.showcase?.totalCount || 0,
      last_synced_at: new Date(),
      last_sync_status: 'success',
      last_sync_error: null,
      ...(shopId ? { shop_id: shopId } : {}),
    });
    await sequelize.query(`
      INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, synced_at)
      VALUES (:authorizationId, :creatorId, 'success', NOW())
    `, { replacements: { authorizationId: authorization.id, creatorId } });
    res.json(overview);
  } catch (error) {
    const creatorId = Number(req.params.creatorId);
    if (Number.isInteger(creatorId)) {
      await TikTokPartnerAuthorization.update({
        last_synced_at: new Date(),
        last_sync_status: 'failed',
        last_sync_error: String(error.message || error).slice(0, 2000),
      }, { where: { creator_id: creatorId } }).catch(() => {});
      await sequelize.query(`
        INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, error, synced_at)
        SELECT id, creator_id, 'failed', :error, NOW()
        FROM tiktok_partner_authorizations WHERE creator_id = :creatorId
      `, { replacements: { creatorId, error: String(error.message || error).slice(0, 2000) } }).catch(() => {});
    }
    res.status(502).json({ message: error.message });
  }
};

const disconnectTikTokPartner = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    const deleted = await TikTokPartnerAuthorization.destroy({ where: { creator_id: creatorId } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Partner connection not found.' });
    res.json({ message: 'TikTok Creator disconnected.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  matchBookingVideo,
  deleteBooking,
  getTargetKocs,
  getTargetKocDetail,
  getTikTokPartnerCollaborations,
  getTikTokPartnerStatuses,
  startTikTokPartnerOauth,
  handleTikTokPartnerOauthCallback,
  disconnectTikTokPartner,
  getTikTokPartnerCreatorOverview,
  __test: {
    bookingVideoDateRange,
    normalizeVideoCandidate,
    tiktokVideoIdFromUrl,
    mergeCreatorCandidates,
  },
};
