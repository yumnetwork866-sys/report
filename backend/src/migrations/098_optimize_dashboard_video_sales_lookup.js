const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS shop_videos_platform_video_lookup_idx
    ON shop_videos (platform_video_id, id)
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS shop_video_snapshots_latest_covering_idx
    ON shop_video_performance_snapshots (
      shop_video_id,
      synced_at DESC NULLS LAST,
      id DESC
    )
    INCLUDE (gross_gmv, orders, currency)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS shop_video_snapshots_latest_covering_idx', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS shop_videos_platform_video_lookup_idx', { transaction });
};

module.exports = { name: '098_optimize_dashboard_video_sales_lookup', up, down };
