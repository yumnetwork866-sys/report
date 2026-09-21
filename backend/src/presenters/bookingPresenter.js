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

const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

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

  return filterBookingVideosBySelectedProducts(await hydrateBookingVideoProducts(serialized));
};

module.exports = { serializeBookings };

