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

module.exports = { loadMonthlyShopVideoRevenue };
