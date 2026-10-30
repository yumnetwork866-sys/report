const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_creator_perf_snapshots_export_id
      ON tiktok_creator_performance_snapshots (export_id);

    CREATE INDEX IF NOT EXISTS idx_channel_report_revenue_video_date
      ON channel_report_video_revenue_daily (platform_video_id, metric_date);

    CREATE INDEX IF NOT EXISTS idx_affiliate_order_skus_order_id
      ON tiktok_affiliate_order_skus (affiliate_order_id);

    DROP INDEX IF EXISTS idx_shop_video_snapshots_latest;
    DROP INDEX IF EXISTS shop_video_snapshots_video_date_idx;
    DROP INDEX IF EXISTS video_daily_stats_video_id_date_idx;
    DROP INDEX IF EXISTS video_daily_stats_video_id_date;
    DROP INDEX IF EXISTS video_daily_stats_date_idx;
    DROP INDEX IF EXISTS booking_video_snapshots_video_date_idx
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS idx_creator_perf_snapshots_export_id;
    DROP INDEX IF EXISTS idx_channel_report_revenue_video_date;
    DROP INDEX IF EXISTS idx_affiliate_order_skus_order_id;

    CREATE INDEX IF NOT EXISTS idx_shop_video_snapshots_latest
      ON shop_video_performance_snapshots (shop_video_id, synced_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS shop_video_snapshots_video_date_idx
      ON shop_video_performance_snapshots (shop_video_id, snapshot_date DESC);

    CREATE INDEX IF NOT EXISTS video_daily_stats_video_id_date_idx
      ON video_daily_stats (video_id, date);

    CREATE INDEX IF NOT EXISTS video_daily_stats_video_id_date
      ON video_daily_stats (video_id, date);

    CREATE INDEX IF NOT EXISTS video_daily_stats_date_idx
      ON video_daily_stats (date);

    CREATE INDEX IF NOT EXISTS booking_video_snapshots_video_date_idx
      ON booking_video_performance_snapshots (booking_video_id, snapshot_date DESC)
  `, { transaction });
};

module.exports = { name: '105_optimize_high_traffic_indexes', up, down };
