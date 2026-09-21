export const compactVideoTitle = (value, maxLength = 40) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

export const dateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const dashboardPeriodRange = (preset) => {
  const end = new Date();
  const start = new Date(end);
  if (preset === 'today') return { startDate: dateInputValue(end), endDate: dateInputValue(end) };
  if (preset === 'yesterday') {
    start.setDate(end.getDate() - 1);
    return { startDate: dateInputValue(start), endDate: dateInputValue(start) };
  }
  if (preset === 'this_week') {
    const day = end.getDay() || 7;
    start.setDate(end.getDate() - day + 1);
  } else if (preset === 'this_month') {
    start.setDate(1);
  } else if (preset === 'last_month') {
    start.setMonth(end.getMonth() - 1, 1);
    end.setDate(0);
  } else {
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
    start.setDate(end.getDate() - (days - 1));
  }
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
};

const DASHBOARD_METRICS = new Set(['gmv', 'views', 'orders', 'likes', 'shares', 'comments', 'video_count']);

export const dashboardInitialFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const allowedPeriods = new Set(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '7d', '30d', '90d', 'custom']);
  const period = allowedPeriods.has(params.get('period')) ? params.get('period') : '30d';
  const fallback = dashboardPeriodRange(period === 'custom' ? '30d' : period);
  const requestedMetric = params.get('metric');
  return {
    channelId: params.get('channel') || '',
    userId: params.get('user') || 'all',
    period,
    startDate: params.get('start_date') || fallback.startDate,
    endDate: params.get('end_date') || fallback.endDate,
    metric: DASHBOARD_METRICS.has(requestedMetric) ? requestedMetric : 'gmv',
  };
};

