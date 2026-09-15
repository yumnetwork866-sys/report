const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE bookings
    SET
      start_date = created_at::date
    WHERE start_date IS NULL
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE bookings
    SET
      start_date = NULL
  `, { transaction });
};

module.exports = { name: '077_set_booking_date', up, down };
