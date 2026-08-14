const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const loadMonthlyShopVideoRevenue = async ({ startDate, endDate }) => {
  const rows = await sequelize.query(`
    SELECT
      platform_video_id,
      SUM(revenue) AS revenue,
      MIN(currency) AS currency
    FROM channel_report_video_revenue_daily
    WHERE metric_date >= CAST(:startDate AS DATE)
      AND metric_date < CAST(:endDate AS DATE)
    GROUP BY platform_video_id
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT,
  });
  return {
    rows: rows.map((row) => ({
      platform_video_id: String(row.platform_video_id),
      revenue: Number(row.revenue) || 0,
      currency: row.currency || null,
    })),
    errors: [],
  };
};

const loadVideoDailyRevenue = async ({ platformVideoId, startDate, endDate }) => {
  const rows = await sequelize.query(`
    WITH requested_dates AS (
      SELECT day::date AS metric_date
      FROM generate_series(
        CAST(:startDate AS DATE),
        CAST(:endDate AS DATE) - INTERVAL '1 day',
        INTERVAL '1 day'
      ) day
    ),
    daily_revenue AS (
      SELECT
        metric_date,
        SUM(revenue) AS revenue,
        MIN(currency) AS currency
      FROM channel_report_video_revenue_daily
      WHERE platform_video_id = :platformVideoId
        AND metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
      GROUP BY metric_date
    )
    SELECT
      TO_CHAR(requested.metric_date, 'YYYY-MM-DD') AS date,
      COALESCE(daily.revenue, 0) AS revenue,
      COALESCE(daily.currency, (SELECT MIN(currency) FROM daily_revenue)) AS currency,
      daily.metric_date IS NOT NULL AS revenue_available
    FROM requested_dates requested
    LEFT JOIN daily_revenue daily ON daily.metric_date = requested.metric_date
    ORDER BY requested.metric_date ASC
  `, {
    replacements: { platformVideoId, startDate, endDate },
    type: QueryTypes.SELECT,
  });
  const days = rows.map((row) => ({
    date: row.date,
    revenue: Number(row.revenue) || 0,
    currency: row.currency || null,
    revenue_available: Boolean(row.revenue_available),
  }));
  return {
    platform_video_id: platformVideoId,
    start_date: startDate,
    end_date: endDate,
    revenue: days.reduce((sum, day) => sum + day.revenue, 0),
    currency: days.find((day) => day.currency)?.currency || null,
    revenue_days: days.filter((day) => day.revenue > 0).length,
    synced_days: days.filter((day) => day.revenue_available).length,
    days,
  };
};

module.exports = { loadMonthlyShopVideoRevenue, loadVideoDailyRevenue };
