const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE booking_videos
    ADD COLUMN IF NOT EXISTS attributed_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb
  `, { transaction });
  await sequelize.query(`
    UPDATE booking_videos AS video
    SET attributed_product_ids = COALESCE(booking.evaluation_snapshot->'product_ids', '[]'::jsonb)
    FROM bookings AS booking
    WHERE booking.id = video.booking_id
      AND video.attributed_product_ids = '[]'::jsonb
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE booking_videos DROP COLUMN IF EXISTS attributed_product_ids', { transaction });
};

module.exports = { name: '088_add_booking_video_product_attribution', up, down };
