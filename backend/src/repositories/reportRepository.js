const models = () => require('../models');

module.exports = {
  query: (...args) => models().sequelize.query(...args),
  findBookings: (options) => models().Booking.findAll(options),
  findUser: (options) => models().User.findOne(options),
};
