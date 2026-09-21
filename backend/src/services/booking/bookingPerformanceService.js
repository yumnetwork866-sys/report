const bookingRepository = require('../../repositories/bookingRepository');
const {
  loadOrderMetricsForBookingProducts,
} = require('../bookingVideoPerformanceService');

const enrichPerformanceViews = async (performance) => {
  if (!performance?.shop_id || !performance?.username) return performance;
  const periodDays = performance.window_type === 'PAST_7_DAYS' ? 7
    : performance.window_type === 'PAST_30_DAYS' ? 30 : null;
  if (!periodDays) return performance;
  const videoMetrics = await bookingRepository.findCreatorVideoMetrics({
    shopId: performance.shop_id,
    username: performance.username,
    periodDays,
  });
  if (videoMetrics?.video_views === null || videoMetrics?.video_views === undefined) return performance;
  return {
    ...performance,
    video_views: videoMetrics.video_views,
    product_impressions: videoMetrics.product_impressions,
    product_clicks: videoMetrics.product_clicks,
    video_views_source: 'AFFILIATE_VIDEO_PERFORMANCE',
  };
};

const monthPeriod = (month) => {
  if (!month || month === 'all' || !/^\d{4}-\d{2}$/.test(month)) return {};
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

const resolvePerformancePeriod = ({ month, start_date: startDate, end_date: endDate }) => {
  if (month === 'custom' && startDate && endDate) {
    return startDate <= endDate
      ? { startDate, endDate }
      : { startDate: endDate, endDate: startDate };
  }
  return monthPeriod(month);
};

const getBookingProductPerformance = async (query = {}) => {
  const { startDate = null, endDate = null } = resolvePerformancePeriod(query);
  const startTime = query.start_time === undefined ? null : Number(query.start_time);
  const endTime = query.end_time === undefined ? null : Number(query.end_time);
  const bookings = await bookingRepository.findForProductPerformance();
  const performance = await loadOrderMetricsForBookingProducts({
    bookings,
    startDate,
    endDate,
    startTime: Number.isFinite(startTime) ? startTime : null,
    endTime: Number.isFinite(endTime) ? endTime : null,
  });
  return { performance: Object.fromEntries(performance) };
};

module.exports = {
  enrichPerformanceViews,
  getBookingProductPerformance,
  resolvePerformancePeriod,
};
