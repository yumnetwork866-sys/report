const { Op, QueryTypes } = require('sequelize');
const {
  sequelize,
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  ShopVideo,
  ShopVideoPerformanceSnapshot,
  TikTokCreatorPerformanceExport,
  TikTokShop,
  TikTokVideoPerformanceSnapshot,
} = require('../models');

const dateOnly = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
const shiftDate = (value, days) => {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
};
const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalizedProductIds = (...sources) => {
  const ids = new Set();
  const visit = (source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(visit);
      return;
    }
    if (typeof source !== 'object') {
      String(source).split(',').map((value) => value.trim()).filter(Boolean).forEach((id) => ids.add(id));
      return;
    }
    const directId = String(source.id || source.product_id || '').trim();
    if (directId) ids.add(directId);
    visit(source.products);
    visit(source.affiliate_products);
    visit(source.breakdowns);
  };
  sources.forEach(visit);
  return ids;
};
const selectedProductIdsOfBooking = (booking) => normalizedProductIds(
  booking?.evaluation_snapshot?.products,
  booking?.evaluation_snapshot?.product_ids,
);
const productIdsOfVideo = (video) => {
  const snapshots = Array.isArray(video?.performance_snapshots) ? video.performance_snapshots : [];
  const rawSources = snapshots.flatMap((snapshot) => {
    const raw = snapshot?.raw_metrics || {};
    const detail = raw?.video?.detail || raw?.detail || {};
    return [
      raw.product_id,
      raw.products,
      raw.video,
      raw.list,
      raw?.video?.list,
      detail?.performance?.intervals?.flatMap((interval) => interval?.sales?.breakdowns || []) || [],
      raw.selected_product_ids,
      raw.order_metrics?.product_ids,
    ];
  });
  return normalizedProductIds(
    video?.product_id,
    video?.products,
    video?.affiliate_products,
    video?.raw_data?.product_id,
    video?.raw_data?.products,
    video?.raw_data?.video?.products,
    video?.order_metrics?.product_ids,
    ...rawSources,
  );
};
const matchesBookingProducts = (booking, video) => {
  const videoIds = productIdsOfVideo(video);
  if (!videoIds.size) return false;
  const selectedIds = selectedProductIdsOfBooking(booking);
  if (!selectedIds.size) return true;
  return [...selectedIds].some((id) => videoIds.has(id));
};
const matchesBookingDateRange = (booking, video, now = new Date()) => {
  if (!video) return false;
  const rawPostDate = video.posted_at || video.video_post_time || video.post_date || video.post_time;
  if (!rawPostDate) return true;
  const postDate = dateOnly(rawPostDate);
  const startDate = booking?.start_date ? dateOnly(booking.start_date) : null;
  if (startDate && postDate < startDate) return false;
  const endDate = booking?.end_date ? dateOnly(booking.end_date) : (booking?.deadline ? dateOnly(booking.deadline) : null);
  if (endDate && postDate > endDate) return false;
  const today = dateOnly(now);
  if (postDate > today) return false;
  return true;
};
const normalizeCachedVideoCandidate = (videoInstance, orderMetrics = null) => {
  const video = typeof videoInstance?.toJSON === 'function' ? videoInstance.toJSON() : videoInstance;
  const latest = [...(video?.performance_snapshots || [])].sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || {};
  const hasOrderMetrics = orderMetrics && (orderMetrics.has_data || orderMetrics.orders > 0 || orderMetrics.gross_gmv > 0);
  const grossGmv = hasOrderMetrics ? numberOrZero(orderMetrics.gross_gmv) : Number(latest.gross_gmv || 0);
  const refundedGmv = hasOrderMetrics && orderMetrics.refunded_gmv !== null && orderMetrics.refunded_gmv !== undefined
    ? numberOrZero(orderMetrics.refunded_gmv) : null;
  const netGmv = hasOrderMetrics && orderMetrics.net_gmv !== null && orderMetrics.net_gmv !== undefined
    ? numberOrZero(orderMetrics.net_gmv) : (refundedGmv !== null ? grossGmv - refundedGmv : null);
  const orders = hasOrderMetrics ? numberOrZero(orderMetrics.orders) : Number(latest.orders || 0);
  const itemsSold = hasOrderMetrics ? numberOrZero(orderMetrics.items_sold) : Number(latest.items_sold || 0);
  const currency = (hasOrderMetrics ? orderMetrics.currency : null) || latest.currency || null;

  return {
    id: String(video.platform_video_id),
    title: video.title || video.platform_video_id,
    username: String(video.creator_username || '').trim().replace(/^@+/, '').toLowerCase(),
    posted_at: video.posted_at || null,
    video_url: video.video_url || null,
    gmv: {
      amount: grossGmv,
      currency,
    },
    refunded_gmv: refundedGmv,
    net_gmv: netGmv,
    views: Number(latest.views || 0),
    orders,
    items_sold: itemsSold,
    ctr: Number(latest.ctr || 0),
    product_id: latest.raw_metrics?.product_id || video.raw_data?.product_id || null,
    products: [
      ...(Array.isArray(video.raw_data?.products) ? video.raw_data.products : []),
      ...(Array.isArray(latest.raw_metrics?.products) ? latest.raw_metrics.products : []),
      ...(orderMetrics?.product_ids ? orderMetrics.product_ids.map((id) => ({ id })) : []),
    ],
    cached_catalog: true,
    catalog_synced_at: latest.synced_at || video.last_seen_at || null,
    order_metrics: orderMetrics || null,
  };
};
const salesOfSnapshot = (snapshot) => snapshot?.raw_metrics?.detail?.performance?.intervals?.[0]?.sales || {};
const scopedMetricsOfSnapshot = (snapshot, selectedProductIds = new Set()) => {
  const sales = salesOfSnapshot(snapshot);
  const breakdowns = Array.isArray(sales.breakdowns) ? sales.breakdowns : [];
  if (!selectedProductIds.size) return null;
  const selected = breakdowns.filter((row) => selectedProductIds.has(String(row?.product_id || row?.id || '').trim()));
  if (!selected.length) return null;
  const amount = selected.reduce((sum, row) => sum + numberOrZero(row?.gmv?.amount ?? row?.gmv), 0);
  const itemsSold = selected.reduce((sum, row) => sum + numberOrZero(row?.items_sold), 0);
  const impressions = selected.reduce((sum, row) => sum + numberOrZero(row?.product_impressions), 0);
  const clicks = selected.reduce((sum, row) => sum + numberOrZero(row?.product_clicks), 0);
  const hasOrderBreakdown = selected.every((row) => row?.sku_orders !== undefined || row?.orders !== undefined);
  const allProductsSelected = breakdowns.length > 0 && selected.length === breakdowns.length;
  return {
    amount,
    currency: selected.find((row) => row?.gmv?.currency)?.gmv.currency || sales?.overall?.gmv?.currency || null,
    items_sold: itemsSold,
    orders: hasOrderBreakdown
      ? selected.reduce((sum, row) => sum + numberOrZero(row?.sku_orders ?? row?.orders), 0)
      : allProductsSelected ? numberOrZero(snapshot.attributed_orders) : 0,
    product_impressions: impressions,
    product_clicks: clicks,
    ctr: impressions > 0 ? clicks / impressions : null,
    product_ids: selected.map((row) => String(row?.product_id || row?.id)),
    orders_available: hasOrderBreakdown || allProductsSelected,
  };
};
const productCtrOfSnapshot = (snapshot) => {
  const impressions = numberOrZero(snapshot.product_impressions);
  return impressions > 0 ? numberOrZero(snapshot.product_clicks) / impressions : null;
};
const usernameOf = (video) => String(
  video?.creator?.user_name || video?.creator?.username || video?.username || '',
).trim().replace(/^@+/, '').toLowerCase();
const postedAtOf = (video) => {
  const raw = String(video?.video_post_time || video?.post_time || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const exportDurationDays = (exportRecord) => {
  const start = Date.parse(`${exportRecord?.start_date}T00:00:00.000Z`);
  const end = Date.parse(`${exportRecord?.end_date}T00:00:00.000Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null;
};

const loadOrderMetricsForVideos = async ({
  shopId,
  shopIds = [],
  videoIds = [],
  startDate = null,
  endDate = null,
} = {}) => {
  const targetShopIds = [...new Set([...(shopId ? [shopId] : []), ...shopIds].map(Number).filter(Number.isInteger))];
  const targetVideoIds = [...new Set(videoIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!targetShopIds.length || !targetVideoIds.length || !sequelize?.query) {
    return new Map();
  }
  const dateClauses = [];
  const replacements = {
    shopIds: targetShopIds,
    videoIds: targetVideoIds,
  };
  if (startDate) {
    replacements.startDateTime = `${dateOnly(startDate)}T00:00:00.000Z`;
    dateClauses.push('o.create_time >= :startDateTime');
  }
  if (endDate) {
    replacements.endDateTime = `${shiftDate(endDate, 1)}T00:00:00.000Z`;
    dateClauses.push('o.create_time < :endDateTime');
  }
  const dateWhere = dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : '';

  try {
    const rows = await sequelize.query(`
      SELECT
        s.shop_id,
        s.content_id AS video_id,
        s.product_id,
        COALESCE(s.currency, 'VND') AS currency,
        COUNT(DISTINCT s.order_id)::bigint AS orders,
        SUM(s.quantity)::bigint AS items_sold,
        SUM(s.refunded_quantity)::bigint AS refunded_quantity,
        SUM(s.quantity * COALESCE(s.price, 0))::numeric AS gross_gmv,
        SUM(s.refunded_quantity * COALESCE(s.price, 0))::numeric AS refunded_gmv
      FROM tiktok_affiliate_order_skus s
      JOIN tiktok_affiliate_orders o ON o.id = s.affiliate_order_id
      WHERE s.shop_id IN (:shopIds)
        AND s.content_id IN (:videoIds)
        ${dateWhere}
      GROUP BY s.shop_id, s.content_id, s.product_id, COALESCE(s.currency, 'VND')
    `, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const metricsByVideo = new Map();
    for (const row of rows || []) {
      const videoKey = `${row.shop_id}:${row.video_id}`;
      if (!metricsByVideo.has(videoKey)) {
        metricsByVideo.set(videoKey, {
          shop_id: Number(row.shop_id),
          video_id: String(row.video_id),
          by_product: new Map(),
          products: [],
        });
      }
      const videoData = metricsByVideo.get(videoKey);
      const productId = String(row.product_id || '').trim();
      const grossGmv = numberOrZero(row.gross_gmv);
      const refundedGmv = numberOrZero(row.refunded_gmv);
      const netGmv = grossGmv - refundedGmv;
      const orders = numberOrZero(row.orders);
      const itemsSold = numberOrZero(row.items_sold);
      const productMetric = {
        product_id: productId,
        currency: row.currency,
        orders,
        items_sold: itemsSold,
        refunded_quantity: numberOrZero(row.refunded_quantity),
        gross_gmv: grossGmv,
        refunded_gmv: refundedGmv,
        net_gmv: netGmv,
      };
      if (productId) {
        videoData.by_product.set(productId, productMetric);
        if (!videoData.products.includes(productId)) {
          videoData.products.push(productId);
        }
      }
    }
    return metricsByVideo;
  } catch (error) {
    console.warn('[Booking Video] Failed to query order ledger metrics:', error?.message || error);
    return new Map();
  }
};

const resolveOrderMetricsForVideo = (videoData, selectedProductIds = new Set()) => {
  if (!videoData) return null;
  const hasSelectedProducts = selectedProductIds && selectedProductIds.size > 0;
  let grossGmv = 0;
  let refundedGmv = 0;
  let orders = 0;
  let itemsSold = 0;
  let currency = null;
  const matchedProducts = [];
  let found = false;

  for (const [prodId, prodMetric] of videoData.by_product.entries()) {
    if (!hasSelectedProducts || selectedProductIds.has(prodId)) {
      found = true;
      grossGmv += prodMetric.gross_gmv;
      refundedGmv += prodMetric.refunded_gmv;
      orders += prodMetric.orders;
      itemsSold += prodMetric.items_sold;
      currency = currency || prodMetric.currency;
      matchedProducts.push(prodId);
    }
  }

  if (!found && hasSelectedProducts) {
    return {
      has_data: false,
      gross_gmv: 0,
      refunded_gmv: 0,
      net_gmv: 0,
      orders: 0,
      items_sold: 0,
      currency: null,
      product_ids: [],
    };
  }

  return {
    has_data: found,
    gross_gmv: grossGmv,
    refunded_gmv: refundedGmv,
    net_gmv: grossGmv - refundedGmv,
    orders,
    items_sold: itemsSold,
    currency,
    product_ids: matchedProducts,
  };
};

const metricOfAffiliateSnapshot = (snapshot, selectedProductIds = new Set(), orderMetrics = null) => {
  const scoped = scopedMetricsOfSnapshot(snapshot, selectedProductIds);
  const hasSelectedProducts = selectedProductIds.size > 0;
  const hasOrderMetrics = orderMetrics && (orderMetrics.has_data || orderMetrics.orders > 0 || orderMetrics.gross_gmv > 0);

  let grossGmv;
  let refundedGmv;
  let netGmv;
  let orders;
  let itemsSold;
  let currency;

  if (hasSelectedProducts) {
    if (orderMetrics) {
      grossGmv = numberOrZero(orderMetrics.gross_gmv);
      refundedGmv = orderMetrics.refunded_gmv !== null && orderMetrics.refunded_gmv !== undefined ? numberOrZero(orderMetrics.refunded_gmv) : null;
      netGmv = orderMetrics.net_gmv !== null && orderMetrics.net_gmv !== undefined ? numberOrZero(orderMetrics.net_gmv) : (refundedGmv !== null ? grossGmv - refundedGmv : null);
      orders = numberOrZero(orderMetrics.orders);
      itemsSold = numberOrZero(orderMetrics.items_sold);
      currency = orderMetrics.currency || null;
    } else if (scoped) {
      grossGmv = scoped.amount;
      refundedGmv = null;
      netGmv = null;
      orders = scoped.orders;
      itemsSold = scoped.items_sold;
      currency = scoped.currency;
    } else {
      grossGmv = 0;
      refundedGmv = null;
      netGmv = null;
      orders = 0;
      itemsSold = 0;
      currency = null;
    }
  } else {
    grossGmv = numberOrZero(snapshot.creator_attributed_gmv);
    orders = numberOrZero(snapshot.attributed_orders);
    itemsSold = numberOrZero(snapshot.attributed_items_sold);
    refundedGmv = orderMetrics?.refunded_gmv !== null && orderMetrics?.refunded_gmv !== undefined ? numberOrZero(orderMetrics.refunded_gmv) : null;
    netGmv = refundedGmv !== null ? grossGmv - refundedGmv : null;
    currency = snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency
      || snapshot.raw_metrics?.list?.gmv?.currency
      || orderMetrics?.currency
      || null;
  }

  return {
    gross_gmv: grossGmv,
    refunded_gmv: refundedGmv,
    net_gmv: netGmv,
    orders,
    items_sold: itemsSold,
    views: numberOrZero(snapshot.video_views),
    ctr: hasSelectedProducts ? (scoped?.ctr ?? null) : productCtrOfSnapshot(snapshot),
    currency: currency || snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency
      || snapshot.raw_metrics?.list?.gmv?.currency
      || null,
    raw_metrics: {
      source: 'AFFILIATE_VIDEO_PERFORMANCE',
      metric_scope: hasSelectedProducts ? 'SELECTED_BOOKING_PRODUCTS' : 'ALL_VIDEO_PRODUCTS',
      selected_product_ids: [...selectedProductIds],
      product_metrics_available: !hasSelectedProducts || Boolean(scoped || hasOrderMetrics),
      product_orders_available: !hasSelectedProducts || Boolean(scoped?.orders_available || hasOrderMetrics),
      order_ledger_used: Boolean(orderMetrics),
      order_metrics: orderMetrics || null,
      export_id: snapshot.export_id,
      product_id: snapshot.product_id || null,
      product_impressions: hasSelectedProducts ? scoped?.product_impressions || 0 : numberOrZero(snapshot.product_impressions),
      product_clicks: hasSelectedProducts ? scoped?.product_clicks || 0 : numberOrZero(snapshot.product_clicks),
      products: snapshot.raw_metrics?.list?.products || [],
      video: snapshot.raw_metrics,
    },
  };
};

const bookingVideoInclude = [{
  model: BookingVideoPerformanceSnapshot,
  as: 'performance_snapshots',
  required: false,
}];

const recordBookingVideoMatch = async (booking, candidate, source, now = new Date()) => {
  const attributionStart = dateOnly(candidate.posted_at || booking.created_at || now);
  const [video] = await BookingVideo.upsert({
    booking_id: booking.id,
    platform_video_id: String(candidate.id),
    video_url: candidate.video_url || null,
    creator_username: candidate.username || booking.creator_username || null,
    title: candidate.title || 'TikTok video',
    posted_at: candidate.posted_at || null,
    attribution_start: attributionStart,
    attribution_end: shiftDate(attributionStart, 30),
    mapping_source: source,
    status: 'COLLECTING',
    last_synced_at: candidate.manually_confirmed ? null : now,
    last_sync_error: null,
    updated_at: now,
  }, { returning: true });

  if (!candidate.manually_confirmed) {
    await BookingVideoPerformanceSnapshot.upsert({
      booking_video_id: video.id,
      snapshot_date: dateOnly(now),
      gross_gmv: numberOrZero(candidate.gmv?.amount),
      refunded_gmv: candidate.refunded_gmv ?? null,
      net_gmv: candidate.net_gmv ?? null,
      orders: numberOrZero(candidate.orders),
      items_sold: numberOrZero(candidate.items_sold),
      views: numberOrZero(candidate.views),
      ctr: candidate.ctr ?? null,
      currency: candidate.gmv?.currency || null,
      raw_metrics: candidate,
      synced_at: now,
    });
  }
  return video;
};

const loadAffiliateVideoPerformance = async (shopId, videoId) => {
  const recentExports = await TikTokCreatorPerformanceExport.findAll({
    where: {
      shop_id: shopId,
      module_type: 'VIDEO_API',
      status: 'SUCCEEDED',
    },
    attributes: ['id', 'start_date', 'end_date'],
    order: [['end_date', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });
  const findSnapshot = async (days) => {
    const exportIds = recentExports
      .filter((record) => exportDurationDays(record) === days)
      .map((record) => record.id);
    if (!exportIds.length) return null;
    return TikTokVideoPerformanceSnapshot.findOne({
      where: {
        export_id: { [Op.in]: exportIds },
        video_id: String(videoId),
      },
      order: [['export_id', 'DESC']],
    });
  };
  return (await findSnapshot(30)) || findSnapshot(7);
};

const affiliateCandidateFromSnapshot = (snapshot, selectedProductIds = new Set(), orderMetrics = null) => {
  const source = snapshot.raw_metrics?.list || {};
  const breakdowns = snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.breakdowns || [];
  const scoped = scopedMetricsOfSnapshot(snapshot, selectedProductIds);
  const hasSelectedProducts = selectedProductIds.size > 0;
  const postedAt = postedAtOf({ video_post_time: snapshot.post_date, post_time: snapshot.post_date });

  let grossGmv;
  let orders;
  let itemsSold;
  let currency;

  if (hasSelectedProducts) {
    if (orderMetrics) {
      grossGmv = numberOrZero(orderMetrics.gross_gmv);
      orders = numberOrZero(orderMetrics.orders);
      itemsSold = numberOrZero(orderMetrics.items_sold);
      currency = orderMetrics.currency || null;
    } else if (scoped) {
      grossGmv = scoped.amount;
      orders = scoped.orders;
      itemsSold = scoped.items_sold;
      currency = scoped.currency;
    } else {
      grossGmv = 0;
      orders = 0;
      itemsSold = 0;
      currency = null;
    }
  } else {
    grossGmv = numberOrZero(snapshot.creator_attributed_gmv);
    orders = numberOrZero(snapshot.attributed_orders);
    itemsSold = numberOrZero(snapshot.attributed_items_sold);
    currency = scoped?.currency || snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency
      || source.gmv?.currency
      || orderMetrics?.currency
      || null;
  }

  return {
    id: String(snapshot.video_id),
    title: snapshot.video_title || source.title || snapshot.video_id,
    username: usernameOf(source),
    posted_at: postedAt,
    video_url: snapshot.video_link || null,
    gmv: {
      amount: grossGmv,
      currency: currency || source.gmv?.currency || null,
    },
    views: numberOrZero(snapshot.video_views),
    orders,
    items_sold: itemsSold,
    ctr: hasSelectedProducts ? scoped?.ctr ?? null : productCtrOfSnapshot(snapshot),
    product_impressions: hasSelectedProducts ? scoped?.product_impressions || 0 : numberOrZero(snapshot.product_impressions),
    product_clicks: hasSelectedProducts ? scoped?.product_clicks || 0 : numberOrZero(snapshot.product_clicks),
    product_metrics_available: !hasSelectedProducts || Boolean(scoped || orderMetrics),
    product_orders_available: !hasSelectedProducts || Boolean(scoped?.orders_available || orderMetrics),
    product_id: snapshot.product_id || null,
    products: [
      ...(Array.isArray(source.products) ? source.products : []),
      ...(Array.isArray(breakdowns) ? breakdowns : []),
      ...(orderMetrics?.product_ids ? orderMetrics.product_ids.map((id) => ({ id })) : []),
    ],
  };
};

const autoLinkBookingVideos = async (booking, now = new Date()) => {
  const username = String(booking.creator_username || '').trim().replace(/^@+/, '').toLowerCase();
  if (!username || !booking.target_shop_id) return { status: 'missing_identity' };

  const selectedProductIds = selectedProductIdsOfBooking(booking);
  let candidates = [];
  let mappingSource = 'SHOP_VIDEO_CATALOG';

  if (ShopVideo?.findAll) {
    const cachedVideos = await ShopVideo.findAll({
      where: {
        shop_id: booking.target_shop_id,
        [Op.or]: [
          { creator_username: { [Op.iLike]: username } },
          { creator_username: { [Op.iLike]: `@${username}` } },
        ],
      },
      include: [{
        model: ShopVideoPerformanceSnapshot,
        as: 'performance_snapshots',
        required: false,
      }],
      order: [['posted_at', 'DESC']],
    });

    if (cachedVideos.length) {
      const videoIds = cachedVideos.map((v) => String(v.platform_video_id));
      const orderMetricsMap = await loadOrderMetricsForVideos({
        shopId: booking.target_shop_id,
        videoIds,
      });

      const catalogCandidates = cachedVideos.map((video) => {
        const videoData = orderMetricsMap.get(`${booking.target_shop_id}:${video.platform_video_id}`);
        const orderMetrics = resolveOrderMetricsForVideo(videoData, selectedProductIds);
        return normalizeCachedVideoCandidate(video, orderMetrics);
      }).filter((candidate) => matchesBookingProducts(booking, candidate) && matchesBookingDateRange(booking, candidate));

      if (catalogCandidates.length) {
        candidates = catalogCandidates;
      }
    }
  }

  if (!candidates.length && TikTokCreatorPerformanceExport?.findAll && TikTokVideoPerformanceSnapshot?.findAll) {
    const recentExports = await TikTokCreatorPerformanceExport.findAll({
      where: {
        shop_id: booking.target_shop_id,
        module_type: 'VIDEO_API',
        status: 'SUCCEEDED',
      },
      attributes: ['id', 'start_date', 'end_date'],
      order: [['end_date', 'DESC'], ['created_at', 'DESC']],
      limit: 20,
    });
    const exportRecord = recentExports.find((record) => exportDurationDays(record) === 30)
      || recentExports.find((record) => exportDurationDays(record) === 7);

    if (exportRecord) {
      const snapshots = await TikTokVideoPerformanceSnapshot.findAll({
        where: {
          export_id: exportRecord.id,
          video_link: { [Op.iLike]: `%/@${username}/video/%` },
        },
        order: [['post_date', 'DESC'], ['id', 'DESC']],
      });

      if (snapshots.length) {
        const videoIds = snapshots.map((s) => String(s.video_id));
        const orderMetricsMap = await loadOrderMetricsForVideos({
          shopId: booking.target_shop_id,
          videoIds,
        });
        const exportCandidates = snapshots
          .map((snapshot) => {
            const videoData = orderMetricsMap.get(`${booking.target_shop_id}:${snapshot.video_id}`);
            const orderMetrics = resolveOrderMetricsForVideo(videoData, selectedProductIds);
            return affiliateCandidateFromSnapshot(snapshot, selectedProductIds, orderMetrics);
          })
          .filter((candidate) => matchesBookingProducts(booking, candidate) && matchesBookingDateRange(booking, candidate));

        if (exportCandidates.length) {
          candidates = exportCandidates;
          mappingSource = 'AFFILIATE_VIDEO_PERFORMANCE';
        }
      }
    }
  }

  if (!candidates.length) return { status: 'no_match', candidate_count: 0 };

  const selected = candidates[0];
  const updatePayload = {
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
    updated_at: now,
  };

  if (['draft', 'booked', 'waiting_video'].includes(booking.status)) {
    updatePayload.status = 'video_posted';
  }

  await booking.update(updatePayload);

  for (const candidate of candidates) {
    await recordBookingVideoMatch(booking, candidate, mappingSource, now);
  }
  return { status: 'matched', video_id: selected.id, video_count: candidates.length };
};

const autoLinkCreatorVideos = async (now, signal) => {
  const bookings = await Booking.findAll({
    where: {
      evaluation_snapshot: { [Op.not]: null },
      target_shop_id: { [Op.not]: null },
    },
    order: [['id', 'ASC']],
  });
  const results = [];
  for (const booking of bookings) {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    results.push({ booking_id: booking.id, ...(await autoLinkBookingVideos(booking, now)) });
  }
  return results;
};

const syncBookingVideo = async (bookingVideo, { shop: suppliedShop, now = new Date(), signal } = {}) => {
  if (signal?.aborted) {
    const error = new Error('Job was stopped by the user.');
    error.name = 'AbortError';
    throw error;
  }
  const booking = bookingVideo.booking;
  const shop = suppliedShop || await TikTokShop.findByPk(booking?.target_shop_id);
  if (!shop) throw new Error('Booking is not linked to a TikTok Shop.');
  try {
    const shopVideo = ShopVideo?.findOne ? await ShopVideo.findOne({
      where: {
        shop_id: shop.id,
        platform_video_id: String(bookingVideo.platform_video_id),
      },
      include: [{
        model: ShopVideoPerformanceSnapshot,
        as: 'performance_snapshots',
        required: false,
      }],
    }) : null;

    const affiliateSnapshot = await loadAffiliateVideoPerformance(shop.id, bookingVideo.platform_video_id).catch(() => null);

    if (!shopVideo && !affiliateSnapshot) {
      if (bookingVideo.attribution_end && dateOnly(now) > bookingVideo.attribution_end) {
        await bookingVideo.update({
          status: 'FINALIZED',
          last_synced_at: now,
          last_sync_error: null,
          updated_at: now,
        });
        return { booking_video_id: bookingVideo.id, platform_video_id: bookingVideo.platform_video_id, status: 'SUCCEEDED' };
      }
    }

    const detectedPostedAt = postedAtOf({
      video_post_time: affiliateSnapshot?.post_date || shopVideo?.posted_at,
      post_time: affiliateSnapshot?.post_date || shopVideo?.posted_at,
    }) || (shopVideo?.posted_at ? new Date(shopVideo.posted_at).toISOString() : null);

    const effectiveAttributionStart = detectedPostedAt
      ? dateOnly(detectedPostedAt)
      : bookingVideo.attribution_start;
    const effectiveAttributionEnd = dateOnly(now);

    const selectedProductIds = selectedProductIdsOfBooking(booking);
    const orderMetricsMap = await loadOrderMetricsForVideos({
      shopId: shop.id,
      videoIds: [bookingVideo.platform_video_id],
      startDate: effectiveAttributionStart,
      endDate: effectiveAttributionEnd,
    });
    const videoData = orderMetricsMap.get(`${shop.id}:${bookingVideo.platform_video_id}`);
    const orderMetrics = resolveOrderMetricsForVideo(videoData, selectedProductIds);

    const latestShopSnapshot = [...(shopVideo?.performance_snapshots || [])].sort((left, right) => (
      String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
      || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
    ))[0] || {};

    let metrics;
    if (affiliateSnapshot) {
      metrics = metricOfAffiliateSnapshot(affiliateSnapshot, selectedProductIds, orderMetrics);
      if (latestShopSnapshot.views) {
        metrics.views = Math.max(metrics.views, numberOrZero(latestShopSnapshot.views));
      }
    } else if (shopVideo || orderMetrics?.has_data) {
      const hasSelected = selectedProductIds.size > 0;
      const grossGmv = orderMetrics ? numberOrZero(orderMetrics.gross_gmv) : numberOrZero(latestShopSnapshot.gross_gmv);
      const refundedGmv = orderMetrics?.refunded_gmv !== null && orderMetrics?.refunded_gmv !== undefined
        ? numberOrZero(orderMetrics.refunded_gmv) : null;
      const netGmv = orderMetrics?.net_gmv !== null && orderMetrics?.net_gmv !== undefined
        ? numberOrZero(orderMetrics.net_gmv) : (refundedGmv !== null ? grossGmv - refundedGmv : null);
      const orders = orderMetrics ? numberOrZero(orderMetrics.orders) : numberOrZero(latestShopSnapshot.orders);
      const itemsSold = orderMetrics ? numberOrZero(orderMetrics.items_sold) : numberOrZero(latestShopSnapshot.items_sold);
      const views = numberOrZero(latestShopSnapshot.views);
      const ctr = latestShopSnapshot.ctr !== null && latestShopSnapshot.ctr !== undefined ? Number(latestShopSnapshot.ctr) : null;
      const currency = orderMetrics?.currency || latestShopSnapshot.currency || 'VND';

      metrics = {
        gross_gmv: grossGmv,
        refunded_gmv: refundedGmv,
        net_gmv: netGmv,
        orders,
        items_sold: itemsSold,
        views,
        ctr,
        currency,
        raw_metrics: {
          source: 'SHOP_VIDEO_CATALOG',
          metric_scope: hasSelected ? 'SELECTED_BOOKING_PRODUCTS' : 'ALL_VIDEO_PRODUCTS',
          selected_product_ids: [...selectedProductIds],
          product_metrics_available: !hasSelected || Boolean(orderMetrics?.has_data),
          product_orders_available: !hasSelected || Boolean(orderMetrics?.has_data),
          order_ledger_used: Boolean(orderMetrics),
          order_metrics: orderMetrics || null,
          product_id: latestShopSnapshot.raw_metrics?.product_id || shopVideo?.raw_data?.product_id || null,
          products: [
            ...(Array.isArray(shopVideo?.raw_data?.products) ? shopVideo.raw_data.products : []),
            ...(orderMetrics?.product_ids ? orderMetrics.product_ids.map((id) => ({ id })) : []),
          ],
          video: shopVideo?.raw_data || null,
        },
      };
    } else {
      throw new Error('Video metrics are not available in Shop Video Catalog or Affiliate Orders yet.');
    }

    await BookingVideoPerformanceSnapshot.upsert({
      booking_video_id: bookingVideo.id,
      snapshot_date: dateOnly(now),
      ...metrics,
      synced_at: now,
    });
    const sourceVideo = affiliateSnapshot?.raw_metrics?.list || shopVideo?.raw_data || {};
    await bookingVideo.update({
      creator_username: usernameOf(sourceVideo) || shopVideo?.creator_username || bookingVideo.creator_username,
      title: affiliateSnapshot?.video_title || sourceVideo.title || shopVideo?.title || bookingVideo.title,
      posted_at: detectedPostedAt || bookingVideo.posted_at,
      ...(detectedPostedAt ? {
        attribution_start: dateOnly(detectedPostedAt),
        attribution_end: effectiveAttributionEnd,
      } : {}),
      status: 'COLLECTING',
      last_synced_at: now,
      last_sync_error: null,
      updated_at: now,
    });
    return { booking_video_id: bookingVideo.id, platform_video_id: bookingVideo.platform_video_id, status: 'SUCCEEDED' };
  } catch (error) {
    await bookingVideo.update({
      status: 'SYNC_FAILED',
      last_synced_at: now,
      last_sync_error: String(error.message || error).slice(0, 4000),
      updated_at: now,
    });
    throw error;
  }
};

const syncActiveBookingVideos = async ({ signal, now = new Date() } = {}) => {
  const autoLinked = await autoLinkCreatorVideos(now, signal);
  const videos = await BookingVideo.findAll({
    where: {
      status: { [Op.in]: ['COLLECTING', 'SYNC_FAILED'] },
    },
    include: [{ association: 'booking', required: true }],
    order: [['id', 'ASC']],
  });
  const results = [];
  for (const video of videos) {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    try {
      results.push(await syncBookingVideo(video, { now, signal }));
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      results.push({
        booking_video_id: video.id,
        platform_video_id: video.platform_video_id,
        status: 'FAILED',
        error: error.message,
      });
    }
  }
  return {
    total: results.length,
    succeeded: results.filter((item) => item.status === 'SUCCEEDED').length,
    failed: results.filter((item) => item.status === 'FAILED').length,
    auto_linked: autoLinked,
    results,
  };
};

const latestSnapshot = (video) => [...(video.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;

const calculateActualPerformance = (booking) => {
  const videos = booking.booking_videos || [];
  const latest = videos.map(latestSnapshot).filter(Boolean);
  const bookingCost = numberOrZero(booking.total_cost ?? booking.booking_cost);
  const grossGmv = latest.reduce((sum, row) => sum + numberOrZero(row.gross_gmv), 0);
  const hasCompleteRefunds = latest.length > 0 && latest.every((row) => row.refunded_gmv !== null && row.refunded_gmv !== undefined);
  const refundedGmv = hasCompleteRefunds
    ? latest.reduce((sum, row) => sum + numberOrZero(row.refunded_gmv), 0)
    : null;
  const netGmv = hasCompleteRefunds ? grossGmv - refundedGmv : null;
  const statuses = new Set(videos.map((video) => video.status));
  const status = !videos.length ? 'AWAITING_VIDEO'
    : statuses.has('COLLECTING') ? 'COLLECTING'
      : statuses.has('SYNC_FAILED') ? 'SYNC_FAILED' : 'FINALIZED';
  return {
    status,
    attribution_days: 30,
    video_count: videos.length,
    snapshot_count: latest.length,
    gross_gmv: grossGmv,
    refunded_gmv: refundedGmv,
    net_gmv: netGmv,
    orders: latest.reduce((sum, row) => sum + numberOrZero(row.orders), 0),
    items_sold: latest.reduce((sum, row) => sum + numberOrZero(row.items_sold), 0),
    views: latest.reduce((sum, row) => sum + numberOrZero(row.views), 0),
    currency: latest.find((row) => row.currency)?.currency || booking.currency || null,
    gross_roas: bookingCost > 0 && latest.length ? grossGmv / bookingCost : null,
    net_roas: bookingCost > 0 && netGmv !== null ? netGmv / bookingCost : null,
    roi: null,
    roi_status: 'MISSING_COST_DATA',
    roi_missing_fields: ['cost_of_goods', 'platform_fee', 'affiliate_commission', 'sample_shipping_cost'],
  };
};

const serializeBookingWithActual = (instance) => {
  const booking = typeof instance?.toJSON === 'function' ? instance.toJSON() : { ...instance };
  return { ...booking, actual_performance: calculateActualPerformance(booking) };
};

module.exports = {
  autoLinkBookingVideos,
  bookingVideoInclude,
  calculateActualPerformance,
  matchesBookingDateRange,
  matchesBookingProducts,
  metricOfAffiliateSnapshot,
  productIdsOfVideo,
  recordBookingVideoMatch,
  serializeBookingWithActual,
  syncActiveBookingVideos,
  syncBookingVideo,
  selectedProductIdsOfBooking,
  loadOrderMetricsForVideos,
  resolveOrderMetricsForVideo,
  __test: {
    dateOnly,
    shiftDate,
    metricOfAffiliateSnapshot,
    productCtrOfSnapshot,
    exportDurationDays,
    affiliateCandidateFromSnapshot,
    normalizeCachedVideoCandidate,
    matchesBookingDateRange,
    matchesBookingProducts,
    productIdsOfVideo,
    selectedProductIdsOfBooking,
    scopedMetricsOfSnapshot,
    latestSnapshot,
    loadOrderMetricsForVideos,
    resolveOrderMetricsForVideo,
  },
};
