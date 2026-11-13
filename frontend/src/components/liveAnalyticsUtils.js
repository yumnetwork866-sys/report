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

export const extractSessionComments = (performance, session) => {
  const value = performance?.total_comments
    ?? performance?.comments
    ?? performance?.interaction_performance?.comments
    ?? session?.totalComments
    ?? session?.total_comments
    ?? session?.comments;
  if (value !== undefined && value !== null) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

export const findLivePerformanceForSession = (performances, session) => {
  const list = Array.isArray(performances) ? performances : [];
  if (!session) return null;
  const sessionId = String(session.sessionId || '');
  const exact = list.find((performance) => String(performance?.live_id || '') === sessionId);
  if (exact) return exact;
  const username = String(session.creatorUsername || '').trim().toLowerCase();
  const firstTime = Number(session.firstTime) || 0;
  const lastTime = Number(session.lastTime) || firstTime;
  if (!username || !firstTime) return null;
  const candidates = list.filter((performance) => {
    if (String(performance?.creator_username || '').trim().toLowerCase() !== username) return false;
    const startTime = Number(performance?.start_time) || 0;
    const endTime = Number(performance?.end_time) || startTime;
    return startTime > 0 && startTime <= lastTime && endTime >= firstTime;
  });
  return candidates.length === 1 ? candidates[0] : null;
};

export const resolveLiveSessionHost = (manualHost, autoHost) => {
  if (manualHost?.id) return { host: manualHost, hostSource: 'manual' };
  if (autoHost?.id) return { host: autoHost, hostSource: 'auto_hashtag' };
  return { host: null, hostSource: null };
};

export const isInternalLiveChannel = ({
  creatorUsername,
  authorType,
  shopName,
  avatarChannelUsername,
  internalChannelUsernames,
} = {}) => {
  const normType = String(authorType || '').trim().toUpperCase();
  if (normType === 'OFFICIAL' || normType === 'MARKETING') return true;
  if (normType === 'AFFILIATE') return false;

  const username = String(creatorUsername || '').trim().toLowerCase().replace(/^@+/, '');
  if (!username) return false;

  const internalSet = internalChannelUsernames instanceof Set
    ? internalChannelUsernames
    : new Set(Array.isArray(internalChannelUsernames) ? internalChannelUsernames.map((u) => String(u || '').trim().toLowerCase().replace(/^@+/, '')) : []);

  if (internalSet.has(username)) return true;

  const avatar = String(avatarChannelUsername || '').trim().toLowerCase().replace(/^@+/, '');
  if (avatar && avatar === username) return true;

  const shopSlug = String(shopName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const creatorSlug = username.replace(/[^a-z0-9]/g, '');
  if (creatorSlug && shopSlug) {
    if (shopSlug.includes(creatorSlug) || creatorSlug.includes(shopSlug)) return true;
  }

  return false;
};

export const resolveLiveSessionSource = ({
  creatorUsername,
  authorType,
  shopName,
  avatarChannelUsername,
  internalChannelUsernames,
  totalCommission = 0,
  commissionRate = 0,
} = {}) => {
  const isInternal = isInternalLiveChannel({
    creatorUsername,
    authorType,
    shopName,
    avatarChannelUsername,
    internalChannelUsernames,
  });
  if (isInternal) return false; // false = Kênh Shop (not external)

  const normType = String(authorType || '').trim().toUpperCase();
  if (normType === 'AFFILIATE') return true; // true = KOC Ngoài

  if (Number(totalCommission) > 0 || Number(commissionRate) > 0) return true;

  const username = String(creatorUsername || '').trim().toLowerCase().replace(/^@+/, '');
  const shopSlug = String(shopName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const creatorSlug = username.replace(/[^a-z0-9]/g, '');
  if (creatorSlug && shopSlug && !shopSlug.includes(creatorSlug) && !creatorSlug.includes(shopSlug)) {
    return true;
  }

  return false;
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
