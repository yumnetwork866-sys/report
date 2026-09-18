const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_shop_video_snapshots_latest
      ON shop_video_performance_snapshots (shop_video_id, synced_at DESC, id DESC)
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_videos_title_tokens_gin
      ON videos USING GIN (
        regexp_split_to_array(LOWER(COALESCE(title, '')), '[^[:alnum:]_#]+')
      )
  `, { transaction });

  await sequelize.query(`
    CREATE OR REPLACE VIEW v_latest_shop_video_performance AS
    SELECT DISTINCT ON (shop_video.platform_video_id)
      shop_video.platform_video_id,
      shop_video.id AS shop_video_id,
      snapshot.gross_gmv,
      snapshot.orders,
      snapshot.currency,
      snapshot.synced_at
    FROM shop_videos shop_video
    JOIN shop_video_performance_snapshots snapshot
      ON snapshot.shop_video_id = shop_video.id
    ORDER BY
      shop_video.platform_video_id,
      snapshot.synced_at DESC NULLS LAST,
      snapshot.id DESC
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP VIEW IF EXISTS v_latest_shop_video_performance', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS idx_videos_title_tokens_gin', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS idx_shop_video_snapshots_latest', { transaction });
};

module.exports = { name: '083_optimize_dashboard_video_analytics', up, down };
