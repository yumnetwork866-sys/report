const cron = require('node-cron');
const { TikTokShop, TikTokShopAuthorization } = require('../models');
const {
  createCreatorPerformanceExportWithFallback,
  createBasePerformanceExportWithFallback,
  processCreatorPerformanceExport,
  processBasePerformanceExport,
  latestCompassEndDay,
} = require('../services/tiktokCreatorPerformanceService');

const startCreatorPerformanceScheduler = () => {
  const schedule = process.env.TIKTOK_CREATOR_PERFORMANCE_SCHEDULE || '30 14 * * *';
  const timezone = process.env.TIKTOK_CREATOR_PERFORMANCE_TIMEZONE || 'Asia/Kuala_Lumpur';
  if (!cron.validate(schedule)) throw new Error(`Invalid TIKTOK_CREATOR_PERFORMANCE_SCHEDULE: ${schedule}`);
  const task = cron.schedule(schedule, async () => {
    const shops = await TikTokShop.findAll({ include: [{ model: TikTokShopAuthorization, as: 'authorization' }] });
    for (const shop of shops) {
      try {
        const { exportRecord, requestedEndDay, endDay } = await createCreatorPerformanceExportWithFallback(shop, {
          windowType: 'PAST_7_DAYS',
          endDay: latestCompassEndDay(shop.region),
          planType: 'ALL',
        });
        if (endDay !== requestedEndDay) {
          console.warn('[Creator Performance Scheduler] Latest day unavailable; using fallback', {
            shopId: shop.id,
            requestedEndDay,
            effectiveEndDay: endDay,
          });
        }
        if (exportRecord.status === 'PROCESSING') await processCreatorPerformanceExport(shop, exportRecord);
        const { exportRecord: baseExportRecord } = await createBasePerformanceExportWithFallback(shop, {
          windowType: 'PAST_7_DAYS',
          endDay,
        });
        if (baseExportRecord.status === 'PROCESSING') await processBasePerformanceExport(shop, baseExportRecord);
      } catch (error) {
        console.error('[Creator Performance Scheduler] Shop failed', { shopId: shop.id, message: error.message });
      }
    }
  }, { name: 'creator-performance-daily-sync', timezone, noOverlap: true });
  console.info('[Creator Performance Scheduler] Started', { schedule, timezone });
  return task;
};

module.exports = { startCreatorPerformanceScheduler };
