const DASHBOARD_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const dashboardMemoryCache = new Map();
const videoMemoryCache = new Map();

export const buildDashboardKey = ({
  channelId = '',
  userId = 'all',
  startDate = '',
  endDate = '',
  metric = 'date',
  topMetric = 'gmv',
} = {}) => `${channelId || 'all'}|${userId || 'all'}|${startDate || 'none'}|${endDate || 'none'}|${metric || 'date'}|${topMetric || 'gmv'}`;

export const buildVideoKey = ({
  channelId = '',
  userId = 'all',
  startDate = '',
  endDate = '',
  date = '',
  page = 1,
  pageSize = 20,
  search = '',
  sortBy = 'published_at',
  sortDirection = 'desc',
} = {}) => `${channelId || 'all'}|${userId || 'all'}|${startDate || 'none'}|${endDate || 'none'}|${date || 'none'}|${search}|${sortBy}|${sortDirection}|${page}|${pageSize}`;

export const getCachedDashboard = (params, ttlMs = DASHBOARD_CACHE_TTL_MS) => {
  const key = buildDashboardKey(params);
  const entry = dashboardMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    dashboardMemoryCache.delete(key);
    return null;
  }
  return entry.data;
};

export const setCachedDashboard = (params, data) => {
  const key = buildDashboardKey(params);
  dashboardMemoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });
};

export const getCachedVideos = (params, ttlMs = DASHBOARD_CACHE_TTL_MS) => {
  const key = buildVideoKey(params);
  const entry = videoMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    videoMemoryCache.delete(key);
    return null;
  }
  return entry.data;
};

export const setCachedVideos = (params, data) => {
  const key = buildVideoKey(params);
  videoMemoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });
};

export const clearDashboardMemoryCache = () => {
  dashboardMemoryCache.clear();
  videoMemoryCache.clear();
};
