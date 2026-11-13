import { moneyValue } from './shop-analytics/shopAnalyticsUtils.js';

export const extractLiveGmv = (row) => {
  if (!row) return 0;
  const breakdowns = Array.isArray(row.gmv_breakdowns) && row.gmv_breakdowns.length > 0
    ? row.gmv_breakdowns
    : (Array.isArray(row?.gmv?.breakdowns) ? row.gmv.breakdowns : []);
  const liveItem = breakdowns.find((b) => b?.type === 'LIVE' || b?.content_type === 'LIVE');
  if (!liveItem) return 0;
  return moneyValue(liveItem?.amount ?? liveItem?.gmv?.amount ?? liveItem?.sales?.gmv?.amount ?? liveItem);
};

export const calculateDurationSeconds = (firstTime, lastTime) => {
  if (!firstTime || !lastTime) return 0;
  const startMs = typeof firstTime === 'number' ? firstTime : Date.parse(firstTime);
  const endMs = typeof lastTime === 'number' ? lastTime : Date.parse(lastTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / 1000);
};

export const formatLiveDuration = (firstTime, lastTime, language = 'vi') => {
  if (!firstTime) return '—';
  const startMs = typeof firstTime === 'number' ? firstTime : Date.parse(firstTime);
  const endMs = typeof lastTime === 'number' ? lastTime : Date.parse(lastTime);
  if (!Number.isFinite(startMs)) return '—';
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return language === 'vi' ? '< 1 phút (1 đơn)' : '< 1 min (1 order)';
  }
  const diffSec = Math.floor((endMs - startMs) / 1000);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (hours > 0) {
    if (language === 'vi') {
      return mins > 0 ? `${hours} tiếng ${mins} phút` : `${hours} tiếng`;
    }
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  }
  if (language === 'vi') {
    return `${Math.max(1, mins)} phút`;
  }
  return `${Math.max(1, mins)} mins`;
};

export const formatTotalDuration = (totalSeconds, language = 'vi') => {
  if (!totalSeconds || totalSeconds <= 0) return '—';
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    if (language === 'vi') {
      return mins > 0 ? `${hours} tiếng ${mins} phút` : `${hours} tiếng`;
    }
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  }
  return language === 'vi' ? `${Math.max(1, mins)} phút` : `${Math.max(1, mins)} mins`;
};
