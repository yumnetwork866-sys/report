const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'bookings'
          AND column_name = 'booking_cost'
      ) THEN
        EXECUTE 'UPDATE bookings SET total_cost = COALESCE(total_cost, booking_cost, 0) WHERE total_cost IS NULL';
      END IF;
    END $$;

    ALTER TABLE bookings
      ALTER COLUMN total_cost SET DEFAULT 0,
      ALTER COLUMN total_cost SET NOT NULL,
      DROP COLUMN IF EXISTS creator_id,
      DROP COLUMN IF EXISTS deadline,
      DROP COLUMN IF EXISTS end_date,
      DROP COLUMN IF EXISTS cost_note,
      DROP COLUMN IF EXISTS booking_cost
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  // The retired identity/date/note values were empty before removal. Rollback
  // restores their schema; historical values require the migration backup.
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deadline DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE,
      ADD COLUMN IF NOT EXISTS cost_note TEXT,
      ADD COLUMN IF NOT EXISTS booking_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;

    UPDATE bookings SET booking_cost = total_cost;

    CREATE INDEX IF NOT EXISTS bookings_creator_id_idx ON bookings (creator_id);
    CREATE INDEX IF NOT EXISTS bookings_deadline_idx ON bookings (deadline);
    CREATE INDEX IF NOT EXISTS bookings_end_date_idx ON bookings (end_date)
  `, { transaction });
};

module.exports = { name: '103_cleanup_legacy_booking_columns', up, down };
