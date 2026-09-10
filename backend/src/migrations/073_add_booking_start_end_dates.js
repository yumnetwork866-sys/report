const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE
  `, { transaction });

  await sequelize.query(`
    UPDATE bookings
    SET
      end_date = COALESCE(end_date, deadline, created_at::date),
      start_date = COALESCE(start_date, created_at::date, deadline)
    WHERE start_date IS NULL OR end_date IS NULL
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS bookings_start_date_idx ON bookings (start_date);
    CREATE INDEX IF NOT EXISTS bookings_end_date_idx ON bookings (end_date);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS bookings_start_date_idx;
    DROP INDEX IF EXISTS bookings_end_date_idx;
    ALTER TABLE bookings
    DROP COLUMN IF EXISTS start_date,
    DROP COLUMN IF EXISTS end_date;
  `, { transaction });
};

module.exports = { name: '073_add_booking_start_end_dates', up, down };
