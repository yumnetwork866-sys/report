const crypto = require('crypto');
const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  ScheduledJob,
  ScheduledJobRun,
  TikTokShop,
  TikTokShopAuthorization,
  TikTokCreatorPerformanceExport,
  TikTokCreatorPerformanceSnapshot,
  sequelize,
} = require('../models');
const {
  createCreatorPerformanceExportWithFallback,
  createBasePerformanceExportWithFallback,
  processCreatorPerformanceExport,
  processBasePerformanceExport,
  shiftEndDay,
  yesterdayEndDay,
} = require('./tiktokCreatorPerformanceService');
const {
  scheduledAnalyticsRange,
  syncShopAnalyticsSnapshot,
} = require('./tiktokShopAnalyticsSyncService');
const { run: syncTikTokChannels } = require('../jobs/syncTiktokChannels');
const { targetCollaborationSyncService } = require('./tiktokTargetCollaborationSyncService');
const { syncActiveBookingVideos } = require('./bookingVideoPerformanceService');
const { syncShopVideoCatalog } = require('./shopVideoCatalogService');
const { syncVideoPerformanceApi } = require('./tiktokVideoPerformanceService');
const { syncChannelReportRevenue } = require('./channelReportRevenueSyncService');

const JOB_KEYS = new Set([
  'tiktok_creator_performance',
  'tiktok_shop_analytics',
  'tiktok_channel_metrics',
  'booking_video_performance',
  'tiktok_shop_video_catalog',
  'tiktok_affiliate_video_performance',
  'tiktok_channel_report_revenue',
]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const activeRunControllers = new Map();
const CREATOR_DAILY_BACKFILL_DAYS = 5;
const CREATOR_DAILY_HISTORY_DAYS = 180;
const SHOP_TIMEZONES = {
  MY: 'Asia/Kuala_Lumpur',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
};

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Job was stopped by the user.');
  error.name = 'AbortError';
  throw error;
};

const normalizeRunTimes = (values) => {
  if (!Array.isArray(values)) throw new Error('run_times must be an array.');
  const times = [...new Set(values.map((value) => String(value || '').trim()))].sort();
  if (!times.length || times.length > 6 || times.some((value) => !TIME_PATTERN.test(value))) {
    throw new Error('Configure between 1 and 6 valid run times using HH:mm.');
  }
  return times;
};

const assertTimezone = (value) => {
  const timezone = String(value || '').trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('timezone is invalid.');
  }
  return timezone;
};

const localScheduleParts = (date, timezone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

const shiftLocalDate = (date, days) => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

const zonedScheduleDate = (date, time, timezone) => {
  const desiredAsUtc = Date.parse(`${date}T${time}:00.000Z`);
  let candidate = desiredAsUtc;
  // Two passes also handle timezones whose UTC offset changes around DST.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = localScheduleParts(new Date(candidate), timezone);
    const actualAsUtc = Date.parse(`${actual.date}T${actual.time}:00.000Z`);
    candidate += desiredAsUtc - actualAsUtc;
  }
  return new Date(candidate);
};

const latestScheduledSlot = (job, now = new Date()) => {
  const local = localScheduleParts(now, job.timezone);
  const times = normalizeRunTimes(job.run_times);
  const elapsedTimes = times.filter((time) => time <= local.time);
  const date = elapsedTimes.length ? local.date : shiftLocalDate(local.date, -1);
  const time = elapsedTimes.length ? elapsedTimes.at(-1) : times.at(-1);
  return {
    date,
    time,
    scheduledAt: zonedScheduleDate(date, time, job.timezone),
    scheduledKey: `SCHEDULED:${date}:${time}`,
  };
};

const connectedShops = () => TikTokShop.findAll({
  include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
  order: [['id', 'ASC']],
});

const runForShops = async (operation, signal) => {
  const shops = await connectedShops();
  const results = [];
  for (const shop of shops) {
    throwIfAborted(signal);
    try {
      results.push({ shop_id: shop.id, status: 'SUCCEEDED', ...(await operation(shop)) });
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      results.push({ shop_id: shop.id, status: 'FAILED', error: error.message });
    }
  }
  const summary = {
    total: results.length,
    succeeded: results.filter((item) => item.status === 'SUCCEEDED').length,
    failed: results.filter((item) => item.status === 'FAILED').length,
    results,
  };
  if (summary.failed) {
    const error = new Error(`${summary.failed}/${summary.total} Shop syncs failed.`);
    error.summary = summary;
    throw error;
  }
  return summary;
};

const syncCreatorPerformanceWindows = async (shop, windows, signal) => {
  const exports = [];
  for (const window of windows) {
    throwIfAborted(signal);
    const { exportRecord, requestedEndDay, endDay, fallbackDays } = await createCreatorPerformanceExportWithFallback(shop, {
      windowType: window.windowType,
      endDay: window.endDay,
      planType: 'ALL',
    });
    if (exportRecord.status === 'PROCESSING') await processCreatorPerformanceExport(shop, exportRecord);
    exports.push({
      window_type: window.windowType,
      requested_end_day: requestedEndDay,
      effective_end_day: endDay,
      fallback_days: fallbackDays,
      start_date: exportRecord.start_date,
      end_date: exportRecord.end_date,
      export_id: exportRecord.id,
    });
  }
  return exports;
};

const creatorDailyBackfillDates = (endDate, availableDates = [], limit = CREATOR_DAILY_BACKFILL_DAYS) => {
  const available = new Set(availableDates.map(String));
  const dates = [];
  const cursor = new Date(`${endDate}T00:00:00.000Z`);
  for (let age = 1; age < CREATOR_DAILY_HISTORY_DAYS && dates.length < limit; age += 1) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const date = cursor.toISOString().slice(0, 10);
    if (!available.has(date)) dates.push(date);
  }
  return dates;
};

const backfillCreatorDailyPerformance = async (shop, effectiveEndDay, signal, now = new Date()) => {
  const endDate = isoEndDay(effectiveEndDay);
  const timezone = SHOP_TIMEZONES[String(shop.region || '').toUpperCase()] || 'UTC';
  const localDate = localScheduleParts(now, timezone).date;
  const localDayStart = zonedScheduleDate(localDate, '00:00', timezone);
  const attemptedToday = await TikTokCreatorPerformanceExport.count({
    where: {
      shop_id: shop.id,
      module_type: 'CREATOR',
      window_type: 'PAST_24H',
      plan_type: 'ALL',
      end_date: { [Op.lt]: endDate },
      created_at: { [Op.gte]: localDayStart },
    },
  });
  const remaining = Math.max(0, CREATOR_DAILY_BACKFILL_DAYS - attemptedToday);
  if (!remaining) return { attempted: 0, succeeded: 0, failed: [], remaining_today: 0 };

  const historyStart = shiftLocalDate(endDate, -(CREATOR_DAILY_HISTORY_DAYS - 1));
  const completed = await TikTokCreatorPerformanceExport.findAll({
    where: {
      shop_id: shop.id,
      module_type: 'CREATOR',
      window_type: 'PAST_24H',
      plan_type: 'ALL',
      status: 'SUCCEEDED',
      start_date: { [Op.gte]: historyStart },
      end_date: { [Op.lt]: endDate },
    },
    attributes: ['end_date'],
  });
  const dates = creatorDailyBackfillDates(endDate, completed.map((row) => row.end_date), remaining);
  const result = { attempted: dates.length, succeeded: 0, failed: [], remaining_today: remaining - dates.length };
  for (const date of dates) {
    throwIfAborted(signal);
    try {
      const { exportRecord } = await createCreatorPerformanceExportWithFallback(shop, {
        windowType: 'PAST_24H',
        endDay: date.replaceAll('-', ''),
        planType: 'ALL',
      }, { maxFallbackDays: 0 });
      if (exportRecord.status === 'PROCESSING') await processCreatorPerformanceExport(shop, exportRecord);
      result.succeeded += 1;
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      result.failed.push({ date, error: error.message });
    }
  }
  return result;
};

const syncBasePerformanceWindows = async (shop, creatorExports, signal) => {
  const exports = [];
  for (const creatorExport of creatorExports) {
    throwIfAborted(signal);
    const { exportRecord, requestedEndDay, endDay, fallbackDays } = await createBasePerformanceExportWithFallback(shop, {
      windowType: creatorExport.window_type,
      endDay: creatorExport.effective_end_day,
    });
    if (exportRecord.status === 'PROCESSING') await processBasePerformanceExport(shop, exportRecord);
    exports.push({
      window_type: creatorExport.window_type,
      requested_end_day: requestedEndDay,
      effective_end_day: endDay,
      fallback_days: fallbackDays,
      start_date: exportRecord.start_date,
      end_date: exportRecord.end_date,
      export_id: exportRecord.id,
    });
  }
  return exports;
};

const isoEndDay = (endDay) => {
  const value = String(endDay);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

const sixMonthSnapshotIsFresh = (snapshotEndDate, effectiveEndDay) => {
  const latest = Date.parse(`${snapshotEndDate}T00:00:00.000Z`);
  const desired = Date.parse(`${isoEndDay(effectiveEndDay)}T00:00:00.000Z`);
  if (!Number.isFinite(latest) || !Number.isFinite(desired)) return false;
  const ageDays = Math.floor((desired - latest) / 86400000);
  return ageDays >= 0 && ageDays < 30;
};

const aggregateSixMonthCreatorPerformance = async (shopId, exports) => {
  const exportIds = exports.map((item) => Number(item.export_id)).filter(Number.isInteger);
  if (exportIds.length !== 6) throw new Error('Six completed 30-day exports are required for the 180-day benchmark.');
  await sequelize.query(`
    WITH source AS (
      SELECT snapshot.*
      FROM tiktok_creator_performance_snapshots snapshot
      WHERE snapshot.export_id IN (:exportIds)
        AND snapshot.window_type = 'PAST_30_DAYS'
    ),
    period AS (
      SELECT MIN(start_date) AS start_date, MAX(end_date) AS end_date
      FROM tiktok_creator_performance_exports
      WHERE id IN (:exportIds)
    )
    INSERT INTO tiktok_creator_performance_snapshots (
      export_id, shop_id, username, nickname, avatar_url, creator_open_id,
      start_date, end_date, window_type, plan_type, currency,
      affiliate_gmv, live_gmv, video_gmv, product_card_gmv,
      affiliate_products_sold, products_sold, items_sold,
      estimated_commission, estimated_flat_fee, average_order_value,
      product_showcase_count, products_added_to_showcase,
      total_sample_content, samples_shipped, affiliate_orders,
      product_impressions, customers, video_views, live_streams,
      shoppable_videos, target_gmv, target_estimated_commission,
      open_gmv, open_estimated_commission, refunded_gmv, items_refunded,
      followers, raw_metrics, synced_at
    )
    SELECT
      MAX(source.export_id), source.shop_id, LOWER(source.username),
      MAX(source.nickname), MAX(source.avatar_url), MAX(source.creator_open_id),
      period.start_date, period.end_date, 'PAST_180_DAYS', 'ALL', source.currency,
      SUM(source.affiliate_gmv), SUM(source.live_gmv), SUM(source.video_gmv),
      SUM(source.product_card_gmv), SUM(source.affiliate_products_sold),
      SUM(source.products_sold), SUM(source.items_sold),
      SUM(source.estimated_commission),
      CASE WHEN COUNT(source.estimated_flat_fee) = COUNT(*) THEN SUM(source.estimated_flat_fee) ELSE NULL END,
      CASE WHEN SUM(source.affiliate_orders) > 0
        THEN SUM(source.affiliate_gmv) / SUM(source.affiliate_orders)
        ELSE 0
      END,
      MAX(source.product_showcase_count), MAX(source.products_added_to_showcase),
      SUM(source.total_sample_content), SUM(source.samples_shipped),
      SUM(source.affiliate_orders), SUM(source.product_impressions),
      SUM(source.customers),
      CASE WHEN COUNT(source.video_views) = COUNT(*) THEN SUM(source.video_views) ELSE NULL END,
      SUM(source.live_streams), SUM(source.shoppable_videos),
      SUM(source.target_gmv), SUM(source.target_estimated_commission),
      SUM(source.open_gmv), SUM(source.open_estimated_commission),
      SUM(source.refunded_gmv), SUM(source.items_refunded), MAX(source.followers),
      jsonb_build_object(
        'source', 'ROLLING_180_AGGREGATE',
        'period_days', 180,
        'source_export_ids', to_jsonb(ARRAY_AGG(DISTINCT source.export_id ORDER BY source.export_id))
      ) || jsonb_strip_nulls(jsonb_build_object(
        'Affiliate GMV', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate GMV') OR (source.raw_metrics ? 'Creator-attributed GMV')) THEN 'aggregated' END,
        'Affiliate refunded GMV', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate refunded GMV') OR (source.raw_metrics ? 'Refunds')) THEN 'aggregated' END,
        'Affiliate orders', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate orders') OR (source.raw_metrics ? 'Attributed orders')) THEN 'aggregated' END,
        'Items sold', CASE WHEN BOOL_OR((source.raw_metrics ? 'Items sold') OR (source.raw_metrics ? 'Creator-attributed items sold')) THEN 'aggregated' END,
        'Affiliate items refunded', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate items refunded') OR (source.raw_metrics ? 'Items refunded')) THEN 'aggregated' END,
        'Avg. order value', CASE WHEN BOOL_OR((source.raw_metrics ? 'Avg. order value') OR (source.raw_metrics ? 'AOV')) THEN 'recalculated' END,
        'Affiliate LIVE streams', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate LIVE streams') OR (source.raw_metrics ? 'LIVE streams')) THEN 'aggregated' END,
        'Affiliate shoppable videos', CASE WHEN BOOL_OR((source.raw_metrics ? 'Affiliate shoppable videos') OR (source.raw_metrics ? 'Videos')) THEN 'aggregated' END,
        'Samples shipped', CASE WHEN BOOL_OR(source.raw_metrics ? 'Samples shipped') THEN 'aggregated' END,
        'Est. commission', CASE WHEN BOOL_OR(source.raw_metrics ? 'Est. commission') THEN 'aggregated' END
      )),
      NOW()
    FROM source
    CROSS JOIN period
    WHERE source.shop_id = :shopId
    GROUP BY source.shop_id, LOWER(source.username), source.currency, period.start_date, period.end_date
    ON CONFLICT (shop_id, username, start_date, end_date, plan_type)
    DO UPDATE SET
      export_id = EXCLUDED.export_id,
      nickname = EXCLUDED.nickname,
      avatar_url = EXCLUDED.avatar_url,
      creator_open_id = EXCLUDED.creator_open_id,
      window_type = EXCLUDED.window_type,
      currency = EXCLUDED.currency,
      affiliate_gmv = EXCLUDED.affiliate_gmv,
      live_gmv = EXCLUDED.live_gmv,
      video_gmv = EXCLUDED.video_gmv,
      product_card_gmv = EXCLUDED.product_card_gmv,
      affiliate_products_sold = EXCLUDED.affiliate_products_sold,
      products_sold = EXCLUDED.products_sold,
      items_sold = EXCLUDED.items_sold,
      estimated_commission = EXCLUDED.estimated_commission,
      estimated_flat_fee = EXCLUDED.estimated_flat_fee,
      average_order_value = EXCLUDED.average_order_value,
      product_showcase_count = EXCLUDED.product_showcase_count,
      products_added_to_showcase = EXCLUDED.products_added_to_showcase,
      total_sample_content = EXCLUDED.total_sample_content,
      samples_shipped = EXCLUDED.samples_shipped,
      affiliate_orders = EXCLUDED.affiliate_orders,
      product_impressions = EXCLUDED.product_impressions,
      customers = EXCLUDED.customers,
      video_views = EXCLUDED.video_views,
      live_streams = EXCLUDED.live_streams,
      shoppable_videos = EXCLUDED.shoppable_videos,
      target_gmv = EXCLUDED.target_gmv,
      target_estimated_commission = EXCLUDED.target_estimated_commission,
      open_gmv = EXCLUDED.open_gmv,
      open_estimated_commission = EXCLUDED.open_estimated_commission,
      refunded_gmv = EXCLUDED.refunded_gmv,
      items_refunded = EXCLUDED.items_refunded,
      followers = EXCLUDED.followers,
      raw_metrics = EXCLUDED.raw_metrics,
      synced_at = EXCLUDED.synced_at
  `, { replacements: { shopId, exportIds } });
  await sequelize.query(`
    WITH period AS (
      SELECT MIN(start_date) AS start_date, MAX(end_date) AS end_date
      FROM tiktok_creator_performance_exports
      WHERE id IN (:exportIds)
    ),
    benchmark AS (
      SELECT snapshot.*
      FROM tiktok_creator_performance_snapshots snapshot
      CROSS JOIN period
      WHERE snapshot.shop_id = :shopId
        AND snapshot.window_type = 'PAST_180_DAYS'
        AND snapshot.start_date = period.start_date
        AND snapshot.end_date = period.end_date
    )
    UPDATE bookings booking
    SET evaluation_snapshot = jsonb_set(
      COALESCE(booking.evaluation_snapshot, '{}'::jsonb),
      '{performance}',
      to_jsonb(benchmark),
      TRUE
    )
    FROM benchmark
    WHERE booking.target_shop_id = benchmark.shop_id
      AND (
        (
          NULLIF(booking.creator_open_id, '') IS NOT NULL
          AND booking.creator_open_id = benchmark.creator_open_id
        )
        OR LOWER(booking.creator_username) = LOWER(benchmark.username)
      )
  `, { replacements: { shopId, exportIds } });
};

const aggregateSixMonthBasePerformance = async (shopId, exports) => {
  const exportIds = exports.map((item) => Number(item.export_id)).filter(Number.isInteger);
  if (exportIds.length !== 6) throw new Error('Six completed BASE exports are required for the 180-day cards.');
  await sequelize.query(`
    WITH source AS (
      SELECT snapshot.*
      FROM tiktok_base_performance_snapshots snapshot
      WHERE snapshot.export_id IN (:exportIds)
        AND snapshot.window_type = 'PAST_30_DAYS'
    ),
    period AS (
      SELECT MIN(start_date) AS start_date, MAX(end_date) AS end_date
      FROM tiktok_creator_performance_exports
      WHERE id IN (:exportIds)
    ),
    creator_aov AS (
      SELECT CASE WHEN SUM(affiliate_orders) > 0
        THEN SUM(affiliate_gmv) / SUM(affiliate_orders)
        ELSE NULL
      END AS value
      FROM tiktok_creator_performance_snapshots
      CROSS JOIN period
      WHERE shop_id = :shopId
        AND window_type = 'PAST_180_DAYS'
        AND start_date = period.start_date
        AND end_date = period.end_date
    )
    INSERT INTO tiktok_base_performance_snapshots (
      export_id, shop_id, start_date, end_date, window_type, currency,
      creator_attributed_gmv, creator_attributed_items_sold, refunds,
      estimated_commission, videos, live_streams, samples_shipped,
      items_refunded, average_order_value, raw_metrics, synced_at
    )
    SELECT
      MAX(source.export_id), source.shop_id, period.start_date, period.end_date,
      'PAST_180_DAYS', source.currency,
      SUM(source.creator_attributed_gmv),
      SUM(source.creator_attributed_items_sold),
      SUM(source.refunds), SUM(source.estimated_commission),
      SUM(source.videos), SUM(source.live_streams), SUM(source.samples_shipped),
      SUM(source.items_refunded), COALESCE(MAX(creator_aov.value), 0),
      jsonb_build_object(
        'source', 'ROLLING_180_AGGREGATE',
        'period_days', 180,
        'source_export_ids', to_jsonb(ARRAY_AGG(DISTINCT source.export_id ORDER BY source.export_id))
      ),
      NOW()
    FROM source
    CROSS JOIN period
    CROSS JOIN creator_aov
    WHERE source.shop_id = :shopId
    GROUP BY source.shop_id, source.currency, period.start_date, period.end_date
    ON CONFLICT (shop_id, start_date, end_date, window_type)
    DO UPDATE SET
      export_id = EXCLUDED.export_id,
      currency = EXCLUDED.currency,
      creator_attributed_gmv = EXCLUDED.creator_attributed_gmv,
      creator_attributed_items_sold = EXCLUDED.creator_attributed_items_sold,
      refunds = EXCLUDED.refunds,
      estimated_commission = EXCLUDED.estimated_commission,
      videos = EXCLUDED.videos,
      live_streams = EXCLUDED.live_streams,
      samples_shipped = EXCLUDED.samples_shipped,
      items_refunded = EXCLUDED.items_refunded,
      average_order_value = EXCLUDED.average_order_value,
      raw_metrics = EXCLUDED.raw_metrics,
      synced_at = EXCLUDED.synced_at
  `, { replacements: { shopId, exportIds } });
};

const refreshSixMonthPerformanceIfNeeded = async (shop, effectiveEndDay, signal) => {
  const latest = await TikTokCreatorPerformanceSnapshot.findOne({
    where: {
      shop_id: shop.id,
      window_type: 'PAST_180_DAYS',
      plan_type: 'ALL',
    },
    attributes: ['end_date'],
    order: [['end_date', 'DESC']],
  });
  if (latest && sixMonthSnapshotIsFresh(latest.end_date, effectiveEndDay)) {
    return { refreshed: false, end_date: latest.end_date, period_days: 180 };
  }
  const windows = [];
  let endDay = effectiveEndDay;
  for (let index = 0; index < 6; index += 1) {
    windows.push({ windowType: 'PAST_30_DAYS', endDay });
    endDay = shiftEndDay(endDay, -30);
  }
  const exports = await syncCreatorPerformanceWindows(shop, windows, signal);
  await aggregateSixMonthCreatorPerformance(shop.id, exports);
  const baseExports = await syncBasePerformanceWindows(shop, exports, signal);
  await aggregateSixMonthBasePerformance(shop.id, baseExports);
  return {
    refreshed: true,
    period_days: 180,
    window_count: exports.length,
    exports,
    base_exports: baseExports,
  };
};

const jobHandlers = {
  tiktok_creator_performance: ({ signal } = {}) => runForShops(async (shop) => {
    const endDay = yesterdayEndDay(shop.region);
    const exports = await syncCreatorPerformanceWindows(shop, [
      { windowType: 'PAST_30_DAYS', endDay },
      { windowType: 'PAST_7_DAYS', endDay },
      // Keep one immutable calendar-day snapshot so arbitrary booking ranges
      // can be aggregated without summing overlapping rolling windows.
      { windowType: 'PAST_24H', endDay },
    ], signal);
    const baseExports = await syncBasePerformanceWindows(shop, exports, signal);
    const dailyBackfill = await backfillCreatorDailyPerformance(
      shop,
      exports.find((item) => item.window_type === 'PAST_24H').effective_end_day,
      signal,
    );
    const sixMonth = await refreshSixMonthPerformanceIfNeeded(
      shop,
      exports[0].effective_end_day,
      signal,
    );
    return { exports, base_exports: baseExports, six_month: sixMonth, daily_backfill: dailyBackfill };
  }, signal),
  tiktok_shop_analytics: ({ signal } = {}) => runForShops(async (shop) => {
    const range = scheduledAnalyticsRange(shop);
    const analytics = await syncShopAnalyticsSnapshot(shop, range);
    throwIfAborted(signal);
    const target_collaborations = await targetCollaborationSyncService.syncShop(shop, { signal });
    return { ...analytics, target_collaborations };
  }, signal),
  tiktok_channel_metrics: async ({ signal } = {}) => {
    throwIfAborted(signal);
    const summary = await syncTikTokChannels({ closeConnection: false });
    throwIfAborted(signal);
    if (summary.failed) {
      const error = new Error(`${summary.failed}/${summary.channels} Channel syncs failed.`);
      error.summary = summary;
      throw error;
    }
    return summary;
  },
  booking_video_performance: ({ signal } = {}) => syncActiveBookingVideos({ signal }),
  tiktok_shop_video_catalog: ({ signal } = {}) => runForShops(
    (shop) => syncShopVideoCatalog(shop, { signal }),
    signal,
  ),
  tiktok_channel_report_revenue: ({ signal } = {}) => runForShops(
    (shop) => syncChannelReportRevenue(shop, { signal }),
    signal,
  ),
  tiktok_affiliate_video_performance: ({ signal } = {}) => runForShops(async (shop) => {
    const { endDate } = scheduledAnalyticsRange(shop);
    const windows = [];
    for (const days of [7, 30]) {
      throwIfAborted(signal);
      const result = await syncVideoPerformanceApi(shop, {
        startDate: shiftLocalDate(endDate, -days),
        endDate,
        currency: 'LOCAL',
      });
      windows.push({ days, ...result });
    }
    return { windows };
  }, signal),
};

const processScheduledJobRun = async (job, run) => {
  const controller = new AbortController();
  activeRunControllers.set(String(run.id), controller);
  try {
    const summary = await jobHandlers[job.job_key]({ signal: controller.signal });
    await run.reload();
    if (run.status !== 'PROCESSING') return run;
    await run.update({ status: 'SUCCEEDED', summary, completed_at: new Date(), error: null });
  } catch (error) {
    await run.reload();
    if (run.status !== 'PROCESSING' || controller.signal.aborted || error.name === 'AbortError') return run;
    console.error('[Schedule Manager] Job failed\n%s', JSON.stringify({
      jobKey: job.job_key,
      runId: String(run.id),
      message: String(error.message || error),
      summary: error.summary || null,
    }, null, 2));
    await run.update({
      status: 'FAILED',
      summary: error.summary || null,
      error: String(error.message || error).slice(0, 4000),
      completed_at: new Date(),
    });
  } finally {
    activeRunControllers.delete(String(run.id));
  }
  return run.reload();
};

const stopScheduledJob = async (job) => {
  const run = await ScheduledJobRun.findOne({
    where: { scheduled_job_id: job.id, status: 'PROCESSING' },
    order: [['started_at', 'DESC']],
  });
  if (!run) return null;
  activeRunControllers.get(String(run.id))?.abort();
  await run.update({
    status: 'CANCELLED',
    error: 'Stopped by user.',
    completed_at: new Date(),
  });
  return run.reload();
};

const createScheduledJobRun = async (job, {
  triggerType = 'MANUAL',
  scheduledKey = `${triggerType}:${Date.now()}:${crypto.randomUUID()}`,
} = {}) => {
  if (!JOB_KEYS.has(job.job_key) || !jobHandlers[job.job_key]) throw new Error(`Unsupported scheduled job: ${job.job_key}`);
  const [run, created] = await ScheduledJobRun.findOrCreate({
    where: { scheduled_job_id: job.id, scheduled_key: scheduledKey },
    defaults: { trigger_type: triggerType, status: 'PROCESSING', started_at: new Date() },
  });
  return { run, created };
};

const executeScheduledJob = async (job, options = {}) => {
  const { run, created } = await createScheduledJobRun(job, options);
  return created ? processScheduledJobRun(job, run) : run;
};

const enqueueScheduledJob = async (job, {
  triggerType = 'MANUAL',
  scheduledKey = `${triggerType}:${Date.now()}:${crypto.randomUUID()}`,
} = {}) => {
  const processing = await ScheduledJobRun.findOne({
    where: { scheduled_job_id: job.id, status: 'PROCESSING' },
    order: [['started_at', 'DESC']],
  });
  if (processing) {
    const configuredStaleAfterMs = Number(process.env.SCHEDULE_JOB_STALE_AFTER_MS);
    const staleAfterMs = Number.isFinite(configuredStaleAfterMs) && configuredStaleAfterMs >= 60 * 60 * 1000
      ? configuredStaleAfterMs
      : 6 * 60 * 60 * 1000;
    if (Date.now() - new Date(processing.started_at).getTime() <= staleAfterMs) {
      return { run: processing, created: false };
    }
    await processing.update({
      status: 'FAILED',
      error: 'Job process stopped before reporting completion.',
      completed_at: new Date(),
    });
  }
  const { run, created } = await createScheduledJobRun(job, { triggerType, scheduledKey });
  if (created) {
    setImmediate(() => processScheduledJobRun(job, run).catch((error) => {
      console.error('[Schedule Manager] Manual run failed', { jobKey: job.job_key, message: error.message });
    }));
  }
  return { run, created };
};

const tickScheduledJobs = async (now = new Date()) => {
  const jobs = await ScheduledJob.findAll({ where: { enabled: true } });
  await Promise.all(jobs.map(async (job) => {
    const local = localScheduleParts(now, job.timezone);
    const times = normalizeRunTimes(job.run_times);
    if (!times.includes(local.time)) return;
    await enqueueScheduledJob(job, {
      triggerType: 'SCHEDULED',
      scheduledKey: `SCHEDULED:${local.date}:${local.time}`,
    });
  }));
};

const catchUpScheduledJobs = async (now = new Date(), {
  JobModel = ScheduledJob,
  RunModel = ScheduledJobRun,
  enqueue = enqueueScheduledJob,
} = {}) => {
  const jobs = await JobModel.findAll({ where: { enabled: true }, order: [['id', 'ASC']] });
  const results = [];
  for (const job of jobs) {
    const slot = latestScheduledSlot(job, now);
    const successfulRun = await RunModel.findOne({
      where: {
        scheduled_job_id: job.id,
        status: 'SUCCEEDED',
        completed_at: { [Op.gte]: slot.scheduledAt },
      },
      order: [['completed_at', 'DESC']],
    });
    if (successfulRun) {
      results.push({ job_key: job.job_key, caught_up: false, reason: 'already_current' });
      continue;
    }
    const currentLocalDate = localScheduleParts(now, job.timezone).date;
    const { run, created } = await enqueue(job, {
      triggerType: 'CATCH_UP',
      scheduledKey: `CATCH_UP:${slot.date}:${slot.time}:${currentLocalDate}`,
    });
    results.push({
      job_key: job.job_key,
      caught_up: created,
      reason: created ? 'overdue' : 'already_queued',
      run_id: run?.id || null,
    });
  }
  return results;
};

const startDatabaseScheduler = () => {
  const task = cron.schedule('0 * * * * *', () => tickScheduledJobs().catch((error) => {
    console.error('[Schedule Manager] Tick failed', { message: error.message });
  }), { name: 'database-schedule-manager', noOverlap: true });
  console.info('[Schedule Manager] Started');
  const catchUpEnabled = String(process.env.SCHEDULE_STARTUP_CATCH_UP_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (catchUpEnabled) {
    setImmediate(() => catchUpScheduledJobs().then((results) => {
      const started = results.filter((result) => result.caught_up).map((result) => result.job_key);
      console.info('[Schedule Manager] Startup catch-up checked', { started });
    }).catch((error) => {
      console.error('[Schedule Manager] Startup catch-up failed', { message: error.message });
    }));
  }
  return task;
};

module.exports = {
  JOB_KEYS,
  normalizeRunTimes,
  assertTimezone,
  localScheduleParts,
  latestScheduledSlot,
  sixMonthSnapshotIsFresh,
  creatorDailyBackfillDates,
  executeScheduledJob,
  enqueueScheduledJob,
  stopScheduledJob,
  tickScheduledJobs,
  catchUpScheduledJobs,
  startDatabaseScheduler,
};
