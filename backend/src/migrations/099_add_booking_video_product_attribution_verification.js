const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE booking_videos
      ADD COLUMN IF NOT EXISTS product_attribution_source VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
      ADD COLUMN IF NOT EXISTS product_attribution_verified_at TIMESTAMPTZ
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE booking_videos
      DROP COLUMN IF EXISTS product_attribution_verified_at,
      DROP COLUMN IF EXISTS product_attribution_source
  `, { transaction });
};

module.exports = { name: '099_add_booking_video_product_attribution_verification', up, down };
