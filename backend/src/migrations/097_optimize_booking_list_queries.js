const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS booking_videos_posted_booking_idx
    ON booking_videos (posted_at, booking_id)
    WHERE posted_at IS NOT NULL
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_video_performance_latest_video_idx
    ON tiktok_video_performance_snapshots (shop_id, video_id, id DESC)
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_affiliate_order_skus_shop_content_idx
    ON tiktok_affiliate_order_skus (shop_id, content_id, affiliate_order_id)
    WHERE content_id IS NOT NULL
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS tiktok_affiliate_order_skus_shop_content_idx', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS tiktok_video_performance_latest_video_idx', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS booking_videos_posted_booking_idx', { transaction });
};

module.exports = { name: '097_optimize_booking_list_queries', up, down };
