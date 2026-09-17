const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
    DROP COLUMN IF EXISTS committed_videos
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS committed_videos INTEGER NOT NULL DEFAULT 1
  `, { transaction });
};

module.exports = { name: '081_remove_booking_committed_videos', up, down };
