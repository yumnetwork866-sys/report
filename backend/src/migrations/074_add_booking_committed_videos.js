const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS committed_videos INTEGER NOT NULL DEFAULT 1
  `, { transaction });

  await sequelize.query(`
    UPDATE bookings
    SET committed_videos = 1
    WHERE committed_videos IS NULL OR committed_videos < 1
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
    DROP COLUMN IF EXISTS committed_videos;
  `, { transaction });
};

module.exports = { name: '074_add_booking_committed_videos', up, down };
