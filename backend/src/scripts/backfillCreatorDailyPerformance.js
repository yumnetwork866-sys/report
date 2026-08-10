require('dotenv').config();

const { TikTokShop, TikTokShopAuthorization, sequelize } = require('../models');
const {
  createCreatorPerformanceExport,
  processCreatorPerformanceExport,
} = require('../services/tiktokCreatorPerformanceService');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BACKFILL_DAYS = 180;

const argumentValue = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
};

const parseDate = (value, name) => {
  if (!DATE_PATTERN.test(String(value || ''))) throw new Error(`--${name} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`--${name} is not a valid date.`);
  }
  return parsed;
};

const endDayValue = (date) => date.toISOString().slice(0, 10).replaceAll('-', '');

const run = async () => {
  const shopId = Number(argumentValue('shop-id'));
  if (!Number.isInteger(shopId) || shopId <= 0) throw new Error('--shop-id must be a positive integer.');
  const start = parseDate(argumentValue('start'), 'start');
  const end = parseDate(argumentValue('end'), 'end');
  const requestedDays = Math.floor((end - start) / 86400000) + 1;
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (requestedDays < 1 || requestedDays > MAX_BACKFILL_DAYS) {
    throw new Error(`Backfill range must contain between 1 and ${MAX_BACKFILL_DAYS} days.`);
  }
  if (end > yesterday) throw new Error('--end must be no later than yesterday.');

  const shop = await TikTokShop.findByPk(shopId, {
    include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
  });
  if (!shop?.authorization) throw new Error('TikTok Shop or its authorization was not found.');

  const summary = { shop_id: shopId, requested_days: requestedDays, succeeded: 0, skipped: 0, failed: [] };
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    try {
      const exportRecord = await createCreatorPerformanceExport(shop, {
        windowType: 'PAST_24H',
        endDay: endDayValue(cursor),
        planType: 'ALL',
      });
      if (exportRecord.status === 'SUCCEEDED') {
        summary.skipped += 1;
      } else {
        await processCreatorPerformanceExport(shop, exportRecord);
        summary.succeeded += 1;
      }
    } catch (error) {
      summary.failed.push({ date, error: error.message });
    }
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed.length) process.exitCode = 1;
};

run()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
