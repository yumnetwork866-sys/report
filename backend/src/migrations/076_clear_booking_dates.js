const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE bookings
    SET
      start_date = NULL,
      end_date = NULL,
      deadline = NULL
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE bookings
    SET
      start_date = created_at::date
  `, { transaction });
};

module.exports = { name: '076_clear_booking_dates', up, down };
