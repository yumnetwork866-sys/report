const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const bookingRepository = require('../../repositories/bookingRepository');
const { getOrSetCache } = require('../../lib/redis');
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
} = require('../tiktokPartnerService');
const {
  calculateActualPerformance,
  loadOrderMetricsForVideos,
  metricOfAffiliateSnapshot,
  recordBookingVideoMatch,
  resolveOrderMetricsForVideo,
  selectedProductIdsOfBooking,
  syncBookingVideo,
  applyBookingProductPerformance,
} = require('../bookingVideoPerformanceService');
const { handleShopOauthCallback } = require('../tiktokShop/tiktokShopEndpointService');
const { serializeBookings: serializeBookingsWithFreshCreatorAvatars } = require('../../presenters/bookingPresenter');
const bookingQueryService = require('./bookingQueryService');
const bookingCommandService = require('./bookingCommandService');
const bookingPerformanceService = require('./bookingPerformanceService');
const { enrichPerformanceViews } = bookingPerformanceService;
const { findTargetCreator } = require('./bookingTargetService');
const {
  bookingVideoDateRange,
  findBookingVideoCandidates,
  normalizeVideoCandidate,
  normalizedUsername,
  tiktokVideoIdFromUrl,
} = require('./bookingVideoService');
const {
  creatorCollaborationsFixture,
  creatorOverviewFixture,
  isDemoAuthorization,
} = require('../../lib/tiktokDemoFixtures');

const BOOKING_PERFORMANCE_WINDOWS = new Set([
  'LIFETIME', 'PAST_7_DAYS', 'PAST_30_DAYS', 'PAST_60_DAYS', 'PAST_90_DAYS',
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


const shiftDateString = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const applyBookingVideoPerformanceWindow = async (bookings, performanceWindow, customRange = {}) => {
  const days = Number(String(performanceWindow || '').match(/^PAST_(\d+)_DAYS$/)?.[1]);
  const isCustomRange = customRange.startDate
    && customRange.endDate;

  const videoIds = [...new Set(bookings.flatMap((booking) => (
    (booking.booking_videos || []).map((video) => String(video.platform_video_id || '').trim())
  )).filter(Boolean))];

  if ((!days && !isCustomRange) || !bookings.length || !videoIds.length) {
    return bookings;
  }
  const shopIds = [...new Set(bookings.map((booking) => Number(booking.target_shop_id)).filter(Number.isInteger))];
  const exports = days ? await bookingRepository.findVideoPerformanceExports({
    where: { shop_id: { [Op.in]: shopIds }, module_type: 'VIDEO_API', status: 'SUCCEEDED' },
    attributes: ['id', 'shop_id', 'start_date', 'end_date', 'completed_at', 'created_at'],
    order: [['end_date', 'DESC'], ['completed_at', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
  }) : [];
  const selectedExportByShop = new Map();
  if (days) {
    for (const record of exports) {
      const start = Date.parse(`${record.start_date}T00:00:00.000Z`);
      const end = Date.parse(`${record.end_date}T00:00:00.000Z`);
      if (Math.round((end - start) / 86400000) !== days || selectedExportByShop.has(Number(record.shop_id))) continue;
      selectedExportByShop.set(Number(record.shop_id), record);
    }
  }
  const exportIds = [...selectedExportByShop.values()].map((record) => record.id);
  const snapshots = exportIds.length && videoIds.length ? await bookingRepository.findVideoPerformanceSnapshots({
    where: { export_id: { [Op.in]: exportIds }, video_id: { [Op.in]: videoIds } },
  }).catch(() => []) : [];
  const snapshotByExportAndVideo = new Map((snapshots || []).map((snapshot) => [
    `${snapshot.export_id}:${snapshot.video_id}`,
    snapshot,
  ]));

  const fallbackSnapshots = videoIds.length && typeof bookingRepository.findVideoPerformanceSnapshots === 'function'
    ? await bookingRepository.findVideoPerformanceSnapshots({
      where: { video_id: { [Op.in]: videoIds } },
      order: [['export_id', 'DESC'], ['id', 'DESC']],
    }).catch(() => [])
    : [];
  const latestSnapshotByVideoId = new Map();
  for (const snap of fallbackSnapshots) {
    if (!latestSnapshotByVideoId.has(snap.video_id)) {
      latestSnapshotByVideoId.set(snap.video_id, snap);
    }
  }

  const orderMetricsByShopAndVideo = new Map();
  const windows = new Map();
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const fallbackEndDate = yesterday.toISOString().slice(0, 10);

  if (isCustomRange) {
    const key = `${customRange.startDate}:${customRange.endDate}`;
    windows.set(key, {
      startDate: customRange.startDate,
      endDate: customRange.endDate,
      startTime: customRange.startTime,
      endTime: customRange.endTime,
      shopIds: [...shopIds],
    });
  } else if (days) {
    for (const shopId of shopIds) {
      const record = selectedExportByShop.get(shopId);
      const endDate = record?.end_date || fallbackEndDate;
      const startDate = record?.start_date || shiftDateString(endDate, -days);
      const key = `${startDate}:${endDate}`;
      if (!windows.has(key)) windows.set(key, { startDate, endDate, shopIds: [] });
      windows.get(key).shopIds.push(shopId);
    }
  }

  for (const win of windows.values()) {
    const metricsMap = await loadOrderMetricsForVideos({
      shopIds: win.shopIds,
      videoIds,
      startDate: win.startDate,
      endDate: win.endDate,
      startTime: win.startTime,
      endTime: win.endTime,
    });
    for (const [k, v] of metricsMap.entries()) {
      orderMetricsByShopAndVideo.set(k, v);
    }
  }

  for (const booking of bookings) {
    const exportRecord = selectedExportByShop.get(Number(booking.target_shop_id));
    const selectedIds = selectedProductIdsOfBooking(booking);
    const windowEndDate = isCustomRange
      ? customRange.endDate
      : (exportRecord?.end_date || fallbackEndDate);
    const windowStartDate = isCustomRange
      ? customRange.startDate
      : (exportRecord?.start_date || (days ? shiftDateString(windowEndDate, -days) : null));

    for (const video of booking.booking_videos || []) {
      const existingSnapshots = Array.isArray(video.performance_snapshots) ? video.performance_snapshots : [];
      const existingLatest = existingSnapshots[0] || null;
      const fallbackSnap = latestSnapshotByVideoId.get(video.platform_video_id);
      const snapshot = exportRecord
        ? snapshotByExportAndVideo.get(`${exportRecord.id}:${video.platform_video_id}`)
        : null;
      const videoData = orderMetricsByShopAndVideo.get(`${booking.target_shop_id}:${video.platform_video_id}`);
      const orderMetrics = resolveOrderMetricsForVideo(videoData, selectedIds);
      const resolvedViews = existingLatest?.views
        ?? fallbackSnap?.video_views
        ?? (existingLatest?.raw_metrics?.views !== undefined ? existingLatest.raw_metrics.views : null)
        ?? (existingLatest?.raw_metrics?.video?.list?.views !== undefined ? existingLatest.raw_metrics.video.list.views : null);
      const resolvedCtr = existingLatest?.ctr ?? fallbackSnap?.ctr ?? null;
      const hasExistingSocial = Boolean(
        existingLatest?.raw_metrics?.social_metrics
        && (
          existingLatest.raw_metrics.social_metrics.available
          || existingLatest.raw_metrics.social_metrics.likes !== null
          || existingLatest.raw_metrics.social_metrics.comments !== null
          || existingLatest.raw_metrics.social_metrics.shares !== null
        )
      );
      const fallbackSocial = fallbackSnap ? {
        available: true,
        views: fallbackSnap.video_views !== null && fallbackSnap.video_views !== undefined ? Number(fallbackSnap.video_views) : null,
        likes: fallbackSnap.likes !== null && fallbackSnap.likes !== undefined ? Number(fallbackSnap.likes) : null,
        comments: fallbackSnap.comments !== null && fallbackSnap.comments !== undefined ? Number(fallbackSnap.comments) : null,
        shares: fallbackSnap.shares !== null && fallbackSnap.shares !== undefined ? Number(fallbackSnap.shares) : null,
        metric_window: 'PAST_30_DAYS',
        synced_at: fallbackSnap.synced_at || null,
      } : null;
      const resolvedSocial = (hasExistingSocial ? existingLatest.raw_metrics.social_metrics : null)
        || fallbackSocial
        || existingLatest?.raw_metrics?.social_metrics
        || null;

      video.performance_snapshots = snapshot ? [{
        snapshot_date: exportRecord.end_date,
        ...metricOfAffiliateSnapshot(snapshot, selectedIds, orderMetrics),
        synced_at: snapshot.synced_at || exportRecord.completed_at || exportRecord.created_at,
      }] : (exportRecord || isCustomRange || days) ? [{
        snapshot_date: windowEndDate,
        gross_gmv: orderMetrics?.gross_gmv || 0,
        refunded_gmv: orderMetrics?.refunded_gmv ?? 0,
        net_gmv: orderMetrics?.net_gmv ?? null,
        orders: orderMetrics?.orders || 0,
        items_sold: orderMetrics?.items_sold || 0,
        items_refunded: orderMetrics?.items_refunded ?? 0,
        estimated_commission: orderMetrics?.estimated_commission
          ?? ((orderMetrics?.orders || 0) === 0 ? 0 : null),
        views: resolvedViews !== null && resolvedViews !== undefined ? Number(resolvedViews) : null,
        ctr: resolvedCtr !== null && resolvedCtr !== undefined ? Number(resolvedCtr) : null,
        currency: orderMetrics?.currency || booking.currency || null,
        raw_metrics: {
          source: orderMetrics?.has_data ? 'AFFILIATE_ORDER_LEDGER' : 'AFFILIATE_VIDEO_PERFORMANCE',
          metric_scope: selectedIds.size ? 'SELECTED_BOOKING_PRODUCTS' : 'ALL_VIDEO_PRODUCTS',
          selected_product_ids: [...selectedIds],
          no_activity_in_window: !orderMetrics?.has_data,
          order_ledger_used: Boolean(orderMetrics),
          order_metrics: orderMetrics || null,
          video: existingLatest?.raw_metrics?.video || fallbackSnap?.raw_metrics || null,
          social_metrics: resolvedSocial,
        },
        synced_at: exportRecord?.completed_at || exportRecord?.created_at || new Date().toISOString(),
      }] : [];
    }
    booking.actual_performance = {
      ...calculateActualPerformance(booking),
      window_type: isCustomRange ? 'CUSTOM' : performanceWindow,
      start_date: windowStartDate,
      end_date: windowEndDate,
    };
  }
  return bookings;
};



const resolveSellerShopId = async (authorization, requestedShopId) => {
  const explicitShopId = String(requestedShopId || '').trim();
  if (explicitShopId) return explicitShopId;
  const sellerShop = await bookingRepository.findSellerShop();
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
  const customCoverageRows = isCustomRange && shopIds.length ? await bookingRepository.query(`
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
      ? await bookingRepository.query(`
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
      : await bookingRepository.findCreatorPerformanceSnapshots({
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
    const rows = await bookingRepository.query(`
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
        filtered.shop_id,
        shop.name AS shop_name,
        filtered.creator_open_id,
        filtered.username,
        filtered.nickname,
        filtered.avatar_url,
        filtered.collaboration_count,
        COUNT(*) OVER()::integer AS total_count
      FROM filtered
      LEFT JOIN tiktok_shops shop ON shop.id = filtered.shop_id
      ORDER BY collaboration_count DESC, COALESCE(nickname, username) ASC, filtered.shop_id ASC
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
        ...(row.shop_name ? { shop_name: row.shop_name } : {}),
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


const getTargetKocDetail = async (req, res) => {
  try {
    const targetCreator = await findTargetCreator({
      shopId: req.query.shop_id,
      collaborationId: req.query.collaboration_id,
      creatorOpenId: req.query.creator_open_id,
      creatorUsername: req.query.username,
      performanceWindow: req.query.window_type,
    });
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
    const startTime = req.query?.start_time ? Number(req.query.start_time) : null;
    const endTime = req.query?.end_time ? Number(req.query.end_time) : null;
    const requestedMonth = String(req.query?.month || '').trim();
    const requestedUsername = String(req.query?.creator_username || '').trim().replace(/^@+/, '');
    const requestedOpenId = String(req.query?.creator_open_id || '').trim();
    const requestedStaffId = req.query?.staff_id ? Number(req.query.staff_id) : null;
    const includeProductPerformance = !['false', '0'].includes(
      String(req.query?.include_product_performance || '').trim().toLowerCase(),
    );
    let customRange = requestedWindow === 'CUSTOM'
      ? customPerformanceRange(startDate, endDate)
      : {};
    if (requestedWindow === 'CUSTOM' && !customRange) {
      return res.status(400).json({
        message: `Custom dates must be valid, end no later than yesterday, and span at most ${MAX_CUSTOM_PERFORMANCE_DAYS} days.`,
      });
    }
    if (requestedWindow !== 'CUSTOM' && parseDateOnly(startDate) && parseDateOnly(endDate)) {
      const rangeStart = startDate <= endDate ? startDate : endDate;
      const rangeEnd = startDate <= endDate ? endDate : startDate;
      customRange = {
        startDate: rangeStart,
        endDate: rangeEnd,
        requestedDays: Math.floor((parseDateOnly(rangeEnd) - parseDateOnly(rangeStart)) / 86400000) + 1,
      };
    }
    if (customRange.startDate && Number.isFinite(startTime) && Number.isFinite(endTime)) {
      customRange.startTime = startTime;
      customRange.endTime = endTime;
    }

    let creatorWhere = {};
    if (requestedOpenId) {
      creatorWhere = { creator_open_id: requestedOpenId };
    } else if (requestedUsername) {
      creatorWhere = { creator_username: { [Op.iLike]: requestedUsername } };
    }
    const staffWhere = Number.isInteger(requestedStaffId) && requestedStaffId > 0
      ? { staff_id: requestedStaffId }
      : {};

    let monthWhere = {};
    if (requestedMonth === 'custom' && startDate && endDate && parseDateOnly(startDate) && parseDateOnly(endDate)) {
      const rangeStart = startDate <= endDate ? startDate : endDate;
      const rangeEnd = startDate <= endDate ? endDate : startDate;
      monthWhere = {
        [Op.or]: [
          { start_date: { [Op.between]: [rangeStart, rangeEnd] } },
          { end_date: { [Op.between]: [rangeStart, rangeEnd] } },
          { deadline: { [Op.between]: [rangeStart, rangeEnd] } },
          {
            [Op.and]: [
              { start_date: { [Op.lte]: rangeEnd } },
              { end_date: { [Op.gte]: rangeStart } },
            ],
          },
          {
            start_date: null,
            [Op.or]: [
              { deadline: { [Op.between]: [rangeStart, rangeEnd] } },
              { created_at: { [Op.between]: [`${rangeStart}T00:00:00.000Z`, `${rangeEnd}T23:59:59.999Z`] } },
            ],
          },
        ],
      };
    } else if (requestedMonth && requestedMonth !== 'all' && /^\d{4}-\d{2}$/.test(requestedMonth)) {
      const monthStart = `${requestedMonth}-01`;
      const [y, m] = requestedMonth.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthEnd = `${requestedMonth}-${String(lastDay).padStart(2, '0')}`;
      monthWhere = {
        [Op.or]: [
          { start_date: { [Op.between]: [monthStart, monthEnd] } },
          { end_date: { [Op.between]: [monthStart, monthEnd] } },
          { deadline: { [Op.between]: [monthStart, monthEnd] } },
          {
            [Op.and]: [
              { start_date: { [Op.lte]: monthEnd } },
              { end_date: { [Op.gte]: monthStart } },
            ],
          },
          {
            start_date: null,
            [Op.or]: [
              { deadline: { [Op.between]: [monthStart, monthEnd] } },
              { created_at: { [Op.between]: [`${monthStart}T00:00:00.000Z`, `${monthEnd}T23:59:59.999Z`] } },
            ],
          },
        ],
      };
    }

    const cacheKey = `bookings:list:${requestedWindow || 'default'}:${requestedMonth || 'all'}:${requestedUsername || 'any'}:${requestedOpenId || 'any'}:${requestedStaffId || 'any-staff'}:${startDate || 'none'}:${endDate || 'none'}:${startTime || 'none'}:${endTime || 'none'}:${includeProductPerformance ? 'with-product' : 'video-only'}`;
    const { data: payload, hit } = await getOrSetCache(cacheKey, 120, async () => {
      const bookings = await bookingRepository.findBookings({
        where: {
          evaluation_snapshot: { [Op.not]: null },
          ...monthWhere,
          ...creatorWhere,
          ...staffWhere,
        },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
      });
      const serialized = await applyBookingVideoPerformanceWindow(
        await serializeBookingsWithFreshCreatorAvatars(bookings),
        requestedWindow,
        customRange,
      );
      let periodStartDate = customRange.startDate || null;
      let periodEndDate = customRange.endDate || null;
      if (!periodStartDate && !periodEndDate) {
        if (requestedMonth === 'custom' && startDate && endDate) {
          periodStartDate = startDate <= endDate ? startDate : endDate;
          periodEndDate = startDate <= endDate ? endDate : startDate;
        } else if (requestedMonth && requestedMonth !== 'all' && /^\d{4}-\d{2}$/.test(requestedMonth)) {
          periodStartDate = `${requestedMonth}-01`;
          const [y, m] = requestedMonth.split('-').map(Number);
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          periodEndDate = `${requestedMonth}-${String(lastDay).padStart(2, '0')}`;
        }
      }
      const withProductPerf = includeProductPerformance
        ? await applyBookingProductPerformance(serialized, {
          startDate: periodStartDate,
          endDate: periodEndDate,
        })
        : serialized;
      return addReferencePerformance(withProductPerf, requestedWindow, customRange);
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBookingProductPerformance = async (req, res) => {
  try {
    res.json(await bookingPerformanceService.getBookingProductPerformance(req.query));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    res.json(await bookingQueryService.getBookingById(req.params.id));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const booking = await bookingCommandService.createBooking({
      body: req.body,
      session: req.session,
    });
    res.status(201).json(booking);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    const booking = await bookingCommandService.updateBooking(req.params.id, {
      body: req.body,
      session: req.session,
    });
    res.json(booking);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};
const matchBookingVideo = async (req, res) => {
  try {
    const booking = await bookingRepository.findById(req.params.id);
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
    await bookingRepository.updateInstance(booking, {
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
    const updated = await bookingRepository.findByIdWithRelations(booking.id);
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
    res.json(await bookingCommandService.deleteBooking(req.params.id));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getTikTokPartnerCollaborations = async (req, res) => {
  try {
    const creatorId = Number(req.query.creator_id);
    if (!Number.isInteger(creatorId)) return res.status(400).json({ message: 'creator_id is required.' });
    const authorization = await bookingRepository.findPartnerAuthorization({ where: { creator_id: creatorId } });
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
    const creators = await bookingRepository.findKocs({
      where: { role: 'koc' },
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
      const creator = await bookingRepository.findKoc({ where: { id: creatorId, role: 'koc' }, attributes: ['id'] });
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

const buildPartnerReturnUrl = (status, message, creatorId, returnPath = '/shop/bookings') => {
  const safeReturnPath = ['/shop/bookings', '/manage/koc-performance', '/bookings'].includes(returnPath)
    ? returnPath
    : '/shop/bookings';
  const url = new URL(safeReturnPath, process.env.FRONTEND_URL || 'http://localhost:3005');
  url.searchParams.set('partner_oauth_status', status);
  if (message) url.searchParams.set('partner_oauth_message', message);
  if (creatorId) url.searchParams.set('creator_id', String(creatorId));
  return url.toString();
};

const isCustomShopOauthState = (state) => {
  try {
    const [payload] = String(state || '').split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded?.oauthType === 'shop_custom' || decoded?.appType === 'custom';
  } catch {
    return false;
  }
};

const handleTikTokPartnerOauthCallback = async (req, res) => {
  let creatorId;
  let returnPath = '/shop/bookings';
  try {
    if (isCustomShopOauthState(req.query.state)) return handleShopOauthCallback(req, res);
    const state = parseAuthorizationState(req.query.state);
    if (state.oauthType === 'shop' || state.oauthType === 'shop_custom') {
      return handleShopOauthCallback(req, res);
    }
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
    const existingByOpenId = await bookingRepository.findPartnerAuthorization({ where: { open_id: openId } });
    const existingByCreator = Number.isInteger(targetCreatorId)
      ? await bookingRepository.findPartnerAuthorization({ where: { creator_id: targetCreatorId } })
      : null;
    if (existingByOpenId && Number.isInteger(targetCreatorId) && existingByOpenId.creator_id !== targetCreatorId) {
      throw new Error('This TikTok Creator is already linked to another KOC.');
    }
    let creator = Number.isInteger(targetCreatorId)
      ? await bookingRepository.findKoc({ where: { id: targetCreatorId, role: 'koc' } })
      : existingByOpenId ? await bookingRepository.findUserById(existingByOpenId.creator_id) : null;
    if (!creator && createKoc) {
      const identifier = crypto.createHash('sha256').update(openId).digest('hex').slice(0, 24);
      creator = await bookingRepository.createKoc({
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
      authorization = await bookingRepository.createPartnerAuthorization(values);
    }
    await bookingRepository.query(`
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
      ? await bookingRepository.findPartnerAuthorization({ where: { creator_id: creatorId } })
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
    await bookingRepository.query(`
      INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, synced_at)
      VALUES (:authorizationId, :creatorId, 'success', NOW())
    `, { replacements: { authorizationId: authorization.id, creatorId } });
    res.json(overview);
  } catch (error) {
    const creatorId = Number(req.params.creatorId);
    if (Number.isInteger(creatorId)) {
      await bookingRepository.updatePartnerAuthorizations({
        last_synced_at: new Date(),
        last_sync_status: 'failed',
        last_sync_error: String(error.message || error).slice(0, 2000),
      }, { where: { creator_id: creatorId } }).catch(() => {});
      await bookingRepository.query(`
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
    const deleted = await bookingRepository.destroyPartnerAuthorizations({ where: { creator_id: creatorId } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Partner connection not found.' });
    res.json({ message: 'TikTok Creator disconnected.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const service = {
  getBookings,
  getBookingById,
  getBookingProductPerformance,
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

module.exports = require('../serviceResult').attachExecutor(service);
