const models = () => require('../models');

module.exports = {
  query: (...args) => models().sequelize.query(...args),
  transaction: (callback) => (
    typeof models().sequelize.transaction === 'function'
      ? models().sequelize.transaction(callback)
      : callback(null)
  ),
  findBookings: (options) => models().Booking.findAll(options),
  findUser: (options) => models().User.findOne(options),
};
