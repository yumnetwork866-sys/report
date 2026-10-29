const { Op } = require('sequelize');
const { TikTokVideoPerformanceSnapshot } = require('../models');
const { loadCreatorProfiles } = require('../services/tiktokCreatorProfileService');
const {
  calculateActualPerformance,
  matchesBookingDateRange,
  matchesBookingProducts,
  productIdsOfVideo,
  serializeBookingWithActual,
} = require('../services/bookingVideoPerformanceService');
const { loadShopProducts } = require('../services/shopProductCatalogService');
const bookingRepository = require('../repositories/bookingRepository');

const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

const latestPerformanceSnapshot = (video = {}) => [...(video.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;

const rawVideoOfSnapshot = (snapshot = {}) => {
  const raw = snapshot.raw_metrics || {};
  return raw.video || raw;
};

const listVideoOfSnapshot = (snapshot = {}) => {
  const rawVideo = rawVideoOfSnapshot(snapshot);
  return rawVideo.list || rawVideo;
};

const compactSocialMetrics = (snapshot = {}) => {
  const rawVideo = rawVideoOfSnapshot(snapshot);
  const listVideo = listVideoOfSnapshot(snapshot);
  const shared = snapshot.raw_metrics?.social_metrics;
  const traffic = rawVideo.detail?.performance?.intervals?.[0]?.traffic || {};
  const source = shared || traffic;
  const social = {
    views: source.views ?? snapshot.views ?? listVideo.views ?? null,
    likes: source.likes ?? snapshot.likes ?? listVideo.likes ?? null,
    comments: source.comments ?? snapshot.comments ?? listVideo.comments ?? null,
    shares: source.shares ?? snapshot.shares ?? listVideo.shares ?? null,
    available: shared?.available ?? ['likes', 'comments', 'shares']
      .some((key) => source[key] !== null && source[key] !== undefined),
    metric_window: shared?.metric_window || null,
    synced_at: shared?.synced_at || snapshot.synced_at || null,
  };
  return Object.values(social).some((value) => value !== null && value !== false) ? social : null;
};

const compactSnapshot = (snapshot) => {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    snapshot_date: snapshot.snapshot_date,
    gross_gmv: snapshot.gross_gmv,
    refunded_gmv: snapshot.refunded_gmv,
    net_gmv: snapshot.net_gmv,
    orders: snapshot.orders,
    items_sold: snapshot.items_sold,
    items_refunded: snapshot.items_refunded,
    estimated_commission: snapshot.estimated_commission,
    views: snapshot.views,
    ctr: snapshot.ctr,
    currency: snapshot.currency,
    social_metrics: compactSocialMetrics(snapshot),
    synced_at: snapshot.synced_at,
  };
};

const hashtagsOfVideo = (video, snapshot) => {
  const rawVideo = rawVideoOfSnapshot(snapshot || {});
  const listVideo = listVideoOfSnapshot(snapshot || {});
  const supplied = [
    video.hashtags,
    rawVideo.hashtags,
    listVideo.hashtags,
  ].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
  const text = [video.title, rawVideo.title, rawVideo.description, listVideo.title, listVideo.description]
    .filter(Boolean)
    .join(' ');
  const extracted = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const normalized = [...supplied, ...extracted].flatMap((value) => {
    if (value && typeof value === 'object') {
      return [value.name || value.hashtag_name || value.hashtag || value.title || ''];
    }
    return String(value || '').split(/[\s,]+/);
  }).map((value) => String(value || '').trim().replace(/^#+/, '')).filter(Boolean);
  return [...new Set(normalized.map((value) => value.toLowerCase()))];
};

const thumbnailOfVideo = (video, snapshot) => {
  const rawVideo = rawVideoOfSnapshot(snapshot || {});
  const listVideo = listVideoOfSnapshot(snapshot || {});
  return video.thumbnail_url
    || listVideo.thumbnail_url
    || listVideo.cover_image_url
    || listVideo.cover_url
    || rawVideo.thumbnail_url
    || rawVideo.cover_image_url
    || rawVideo.cover_url
    || null;
};

const compactBookingVideo = (video = {}) => {
  const latest = latestPerformanceSnapshot(video);
  const performance = compactSnapshot(latest);
  return {
    id: video.id,
    booking_id: video.booking_id,
    platform_video_id: video.platform_video_id,
    video_url: video.video_url,
    creator_username: video.creator_username,
    title: video.title || listVideoOfSnapshot(latest || {}).title || null,
    thumbnail_url: thumbnailOfVideo(video, latest),
    hashtags: hashtagsOfVideo(video, latest),
    posted_at: video.posted_at,
    attribution_start: video.attribution_start,
    attribution_end: video.attribution_end,
    attributed_product_ids: video.attributed_product_ids || [],
    affiliate_products: video.affiliate_products || [],
    mapping_source: video.mapping_source,
    status: video.status,
    last_synced_at: video.last_synced_at,
    last_sync_error: video.last_sync_error,
    shared_booking_count: video.shared_booking_count,
    is_shared_booking_video: video.is_shared_booking_video,
    latest_performance: performance,
  };
};

const compactUser = (user) => user ? {
  id: user.id,
  name: user.name,
  email: user.email,
} : null;

const compactShop = (shop) => shop ? {
  id: shop.id,
  name: shop.name,
  code: shop.code,
  region: shop.region,
} : null;

const serializeBookingSummary = (booking = {}) => {
  const snapshot = booking.evaluation_snapshot || {};
  const products = Array.isArray(snapshot.products) ? snapshot.products.map((product) => ({
    id: product?.id || product?.product_id,
    name: product?.name || product?.title || product?.product_name || null,
    image_url: product?.image_url || product?.imageUrl || product?.main_image_url || product?.thumbnail_url || null,
  })).filter((product) => product.id) : [];
  const productIds = [...new Set([
    ...(Array.isArray(snapshot.product_ids) ? snapshot.product_ids : []),
    ...products.map((product) => product.id),
  ].map((value) => String(value || '').trim()).filter(Boolean))];

  return {
    id: booking.id,
    staff_id: booking.staff_id,
    staff_name: booking.staff_name,
    staff: compactUser(booking.staff),
    creator_id: booking.creator_id,
    creator_open_id: booking.creator_open_id,
    creator_username: booking.creator_username,
    creator_name: booking.creator_name,
    creator_avatar_url: booking.creator_avatar_url,
    target_shop_id: booking.target_shop_id,
    target_shop: compactShop(booking.target_shop),
    target_collaboration_id: booking.target_collaboration_id,
    booking_cost: booking.booking_cost,
    total_cost: booking.total_cost,
    currency: booking.currency,
    status: booking.status,
    start_date: booking.start_date,
    end_date: booking.end_date,
    deadline: booking.deadline,
    video_platform_id: booking.video_platform_id,
    video_url: booking.video_url,
    posted_at: booking.posted_at,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    products,
    product_ids: productIds,
    booking_videos: (booking.booking_videos || []).map(compactBookingVideo),
    video_match_status: booking.video_match_status,
    actual_performance: booking.actual_performance || {},
    product_performance: booking.product_performance,
    reference_performance: booking.reference_performance,
    reference_performance_coverage: booking.reference_performance_coverage,
  };
};

const serializeBookingSummaries = (bookings = []) => bookings.map(serializeBookingSummary);

const affiliateProductsOfSnapshot = (snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const list = rawVideo?.list || raw?.list || {};
  const breakdowns = rawVideo?.detail?.performance?.intervals?.[0]?.sales?.breakdowns
    || raw?.detail?.performance?.intervals?.[0]?.sales?.breakdowns
    || [];
  const products = [
    ...(Array.isArray(raw.products) ? raw.products : []),
    ...(Array.isArray(rawVideo.products) ? rawVideo.products : []),
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
  const shopIds = [...new Set(bookings.map((booking) => Number(booking.target_shop_id)).filter(Number.isInteger))];
  const videoIds = [...new Set(bookings.flatMap((booking) => (
    (booking.booking_videos || []).map((video) => String(video.platform_video_id || '').trim())
  )).filter(Boolean))];
  if (!shopIds.length || !videoIds.length) return bookings;
  const snapshots = typeof bookingRepository.findLatestAffiliateVideoSnapshots === 'function'
    ? await bookingRepository.findLatestAffiliateVideoSnapshots({ shopIds, videoIds })
    : TikTokVideoPerformanceSnapshot?.findAll
      ? await TikTokVideoPerformanceSnapshot.findAll({
        where: {
          shop_id: { [Op.in]: shopIds },
          video_id: { [Op.in]: videoIds },
        },
        attributes: ['shop_id', 'video_id', 'product_id', 'raw_metrics'],
        order: [['id', 'DESC']],
      })
      : [];
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
  const matchingVideos = originalVideos.filter((video) => (
    matchesBookingProducts(booking, video)
    && matchesBookingDateRange(booking, video)
  ));
  booking.booking_videos = matchingVideos;
  booking.video_match_status = matchingVideos.length
    ? 'MATCHED'
    : !originalVideos.length ? 'NO_VIDEO'
      : selectedProductIds.size && originalVideos.some((video) => productIdsOfVideo(video).size)
        ? 'NO_PRODUCT_MATCH' : 'PRODUCT_DATA_PENDING';
  booking.actual_performance = calculateActualPerformance(booking);
  return booking;
});

const markSharedBookingVideos = (bookings) => {
  const bookingIdsByVideo = new Map();
  for (const booking of bookings) {
    for (const video of booking.booking_videos || []) {
      const videoId = String(video.platform_video_id || '').trim();
      if (!videoId) continue;
      const key = String(booking.target_shop_id) + ':' + videoId;
      if (!bookingIdsByVideo.has(key)) bookingIdsByVideo.set(key, new Set());
      bookingIdsByVideo.get(key).add(String(booking.id));
    }
  }
  for (const booking of bookings) {
    for (const video of booking.booking_videos || []) {
      const key = String(booking.target_shop_id) + ':' + String(video.platform_video_id || '').trim();
      const count = bookingIdsByVideo.get(key)?.size || 1;
      video.shared_booking_count = count;
      video.is_shared_booking_video = count > 1;
    }
  }
  return bookings;
};

const serializeBookings = async (bookings = []) => {
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

  return markSharedBookingVideos(
    filterBookingVideosBySelectedProducts(await hydrateBookingVideoProducts(serialized)),
  );
};

module.exports = {
  serializeBookingSummaries,
  serializeBookingSummary,
  serializeBookings,
};

