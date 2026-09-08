const {
  latestCompassEndDay, createCreatorPerformanceExportWithFallback, createBasePerformanceExportWithFallback,
  processCreatorPerformanceExport, processBasePerformanceExport,
} = require('./tiktokCreatorPerformanceService');
const { isCompassRetryableError } = require('./tiktokCompassRequestService');
const { withMonitorContext, recordRunEvent } = require('./scheduledRunMonitorService');

const WINDOWS = ['PAST_30_DAYS', 'PAST_7_DAYS', 'PAST_24H'];
const maxRetries = () => Math.max(0, Math.min(10, Number(process.env.TIKTOK_COMPASS_MAX_RETRIES ?? 4) || 0));
const assertActive = (signal) => {
  if (signal?.aborted) throw Object.assign(new Error('Job was stopped by the user.'), { name: 'AbortError' });
};
const summarizeCompassSync = (state) => {
  const results = state.shops.map((shop) => ({
    shop_id: shop.shop_id, shop_name: shop.shop_name, status: shop.status,
    error: shop.error || null, next_retry_at: shop.next_retry_at || null,
    exports: shop.windows.filter((w) => w.module_type === 'CREATOR' && w.result).map((w) => w.result),
    base_exports: shop.windows.filter((w) => w.module_type === 'BASE' && w.result).map((w) => w.result),
    windows: shop.windows.map(({ module_type, window_type, status, retry_count }) => ({ module_type, window_type, status, retry_count })),
  }));
  return {
    total: results.length,
    succeeded: results.filter((s) => s.status === 'SUCCEEDED').length,
    failed: results.filter((s) => s.status === 'FAILED').length,
    pending: results.filter((s) => s.status === 'RETRY_PENDING').length,
    results, compass_state: state,
  };
};

const syncWindow = async (shop, window, endDay) => {
  const creator = window.module_type === 'CREATOR';
  const { exportRecord, requestedEndDay, endDay: effectiveEndDay, fallbackDays } = await (
    creator ? createCreatorPerformanceExportWithFallback : createBasePerformanceExportWithFallback
  )(shop, { windowType: window.window_type, endDay, planType: 'ALL' });
  if (exportRecord.status === 'PROCESSING') {
    await withMonitorContext({ task_id: exportRecord.task_id },
      () => (creator ? processCreatorPerformanceExport : processBasePerformanceExport)(shop, exportRecord));
  }
  if (Number(effectiveEndDay) !== Number(requestedEndDay)) {
    throw new Error(`Creator Performance did not sync the requested end day: requested ${requestedEndDay}, used ${effectiveEndDay}.`);
  }
  return {
    window_type: window.window_type, requested_end_day: requestedEndDay,
    effective_end_day: effectiveEndDay, fallback_days: fallbackDays,
    start_date: exportRecord.start_date, end_date: exportRecord.end_date, export_id: exportRecord.id,
  };
};

const runResumableCompassSync = async ({
  shops, signal, resumeState, checkpoint = async () => {},
}, { now = Date.now, performWindow = syncWindow, endDayForShop = latestCompassEndDay, retryCap = maxRetries() } = {}) => {
  const state = resumeState || {
    version: 1,
    shops: shops.map((shop) => ({
      shop_id: shop.id, shop_name: shop.name, end_day: endDayForShop(shop.region), status: 'PROCESSING',
      windows: ['CREATOR', 'BASE'].flatMap((moduleType) => WINDOWS.map((windowType) => ({
        module_type: moduleType, window_type: windowType, status: 'PENDING', retry_count: 0,
      }))),
    })),
  };
  // Pin each shop's reporting day before the first request, including retries
  // that resume on another calendar day or after a process restart.
  await checkpoint(summarizeCompassSync(state));
  for (const entry of state.shops) {
    assertActive(signal);
    if (['SUCCEEDED', 'FAILED'].includes(entry.status)) continue;
    if (new Date(entry.next_retry_at || 0).getTime() > now()) continue;
    const shop = shops.find((s) => String(s.id) === String(entry.shop_id));
    if (!shop) {
      entry.status = 'FAILED';
      entry.error = 'Shop is no longer connected.';
      await checkpoint(summarizeCompassSync(state));
      continue;
    }
    entry.status = 'PROCESSING';
    entry.next_retry_at = null;
    for (const window of entry.windows) {
      assertActive(signal);
      if (window.status === 'SUCCEEDED') continue;
      window.status = 'PROCESSING';
      await checkpoint(summarizeCompassSync(state));
      try {
        window.result = await withMonitorContext({
          shop_id: shop.id, shop_name: shop.name, module_type: window.module_type,
          window_type: window.window_type, end_day: entry.end_day, attempt: window.retry_count + 1,
        }, async () => {
          await recordRunEvent('WINDOW_STARTED', { status: 'PROCESSING' });
          try {
            const result = await performWindow(shop, window, entry.end_day);
            await recordRunEvent('WINDOW_FINISHED', { status: 'SUCCEEDED', response_data: result });
            return result;
          } catch (error) {
            await recordRunEvent('WINDOW_FINISHED', { status: isCompassRetryableError(error) ? 'RETRY_PENDING' : 'FAILED', message: error.message });
            throw error;
          }
        });
        assertActive(signal);
        window.status = 'SUCCEEDED';
        entry.error = null;
      } catch (error) {
        assertActive(signal);
        if (error.name === 'AbortError') throw error;
        const deferred = ['TIKTOK_COMPASS_WAIT', 'TIKTOK_COMPASS_COOLDOWN'].includes(error.code);
        const retry = isCompassRetryableError(error) && (deferred || window.retry_count < retryCap);
        entry.error = `${window.module_type}/${window.window_type}: ${error.message}`;
        if (retry) {
          if (!deferred) window.retry_count += 1;
          const delay = Math.min(3600000, 60000 * (2 ** Math.max(0, window.retry_count - 1)));
          entry.next_retry_at = new Date(Math.max(now() + 1000, Number(error.cooldownUntil) || now() + delay)).toISOString();
          entry.status = window.status = 'RETRY_PENDING';
        } else {
          entry.status = window.status = 'FAILED';
          if (isCompassRetryableError(error)) entry.error += ` (retry limit ${retryCap} reached)`;
        }
        await checkpoint(summarizeCompassSync(state));
        break;
      }
      await checkpoint(summarizeCompassSync(state));
    }
    if (entry.windows.every((w) => w.status === 'SUCCEEDED')) entry.status = 'SUCCEEDED';
    await checkpoint(summarizeCompassSync(state));
  }
  const summary = summarizeCompassSync(state);
  if (summary.pending) {
    throw Object.assign(new Error(`${summary.pending}/${summary.total} Shop syncs are waiting to retry Compass.`), {
      code: 'TIKTOK_COMPASS_RETRY_PENDING', summary,
      nextRetryAt: Math.min(...state.shops.filter((s) => s.status === 'RETRY_PENDING').map((s) => new Date(s.next_retry_at).getTime())),
    });
  }
  if (summary.failed) throw Object.assign(new Error(`${summary.failed}/${summary.total} Shop syncs failed.`), { summary });
  return summary;
};

module.exports = { runResumableCompassSync, summarizeCompassSync };
