const bookingRepository = require('../../repositories/bookingRepository');
const { getShopVideoPerformance } = require('../tiktokShopService');
const {
  autoLinkBookingVideos,
  matchesBookingDateRange,
  matchesBookingProducts,
  productIdsOfVideo,
  recordBookingVideoMatch,
} = require('../bookingVideoPerformanceService');
const {
  isDemoAuthorization,
  sellerAffiliateFixture,
} = require('../../lib/tiktokDemoFixtures');

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
  let start;
  if (booking?.start_date) {
    const d = new Date(booking.start_date);
    start = Number.isNaN(d.getTime()) ? earliest : d;
  } else {
    const bookingDate = new Date(
      booking?.evaluation_snapshot?.collaboration?.start_at
        || booking?.created_at
        || booking?.evaluation_snapshot?.recorded_at
        || earliest,
    );
    start = bookingDate > earliest ? bookingDate : earliest;
  }
  let end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  if (booking?.end_date || booking?.deadline) {
    const rawEnd = booking?.end_date || booking?.deadline;
    const d = new Date(rawEnd);
    if (!Number.isNaN(d.getTime())) {
      const candidateEnd = new Date(d);
      candidateEnd.setUTCDate(candidateEnd.getUTCDate() + 1);
      if (candidateEnd > end) end = candidateEnd;
    }
  }
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

  const shop = await bookingRepository.findShopWithAuthorization(booking.target_shop_id);
  if (!shop?.authorization) {
    const error = new Error('TikTok Shop is not connected.');
    error.status = 409;
    throw error;
  }

  const range = bookingVideoDateRange(booking);
  const cached = await bookingRepository.findCachedShopVideos({
    shopId: booking.target_shop_id,
    username,
  });
  if (cached.length) {
      const normalized = cached.map(normalizeCachedVideoCandidate);
      const candidates = normalized.filter((candidate) => (
        matchesBookingProducts(booking, candidate)
        && matchesBookingDateRange(booking, candidate)
      ));
      const productDataComplete = normalized.every((candidate) => productIdsOfVideo(candidate).size > 0);
      if (candidates.length || productDataComplete) {
        return {
          candidates,
          range,
          source: 'SHOP_VIDEO_CATALOG',
        };
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
    .filter((video) => matchesBookingProducts(booking, video) && matchesBookingDateRange(booking, video))
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

const autoLinkCreatedBooking = async (booking) => {
  const linkResult = await autoLinkBookingVideos(booking);
  if (linkResult?.status === 'matched') return;
  const { candidates } = await findBookingVideoCandidates(booking);
  if (!candidates.length) return;
  const selected = candidates[0];
  const mappingSource = selected.cached_catalog
    ? 'SHOP_VIDEO_CATALOG'
    : 'TIKTOK_SHOP_VIDEO_PERFORMANCE';
  await booking.update({
    video_platform_id: selected.id,
    video_url: selected.video_url,
    posted_at: selected.posted_at,
    evaluation_snapshot: {
      ...booking.evaluation_snapshot,
      video_match: {
        source: mappingSource,
        matched_at: new Date().toISOString(),
        video_count: candidates.length,
        ...selected,
      },
    },
    updated_at: new Date(),
  });
  for (const candidate of candidates) {
    await recordBookingVideoMatch(booking, candidate, mappingSource);
  }
};

module.exports = {
  autoLinkCreatedBooking,
  bookingVideoDateRange,
  findBookingVideoCandidates,
  normalizeVideoCandidate,
  normalizedUsername,
  tiktokVideoIdFromUrl,
};
