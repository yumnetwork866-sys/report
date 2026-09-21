const models = () => require('../models');

module.exports = {
  query: (...args) => models().sequelize.query(...args),
  findBookings: (options) => models().Booking.findAll(options),
  findBookingsWithVideos: (options = {}) => models().Booking.findAll({
    ...options,
    include: [{
      model: models().BookingVideo,
      as: 'booking_videos',
      required: false,
      include: [{
        model: models().BookingVideoPerformanceSnapshot,
        as: 'performance_snapshots',
        required: false,
      }],
    }],
  }),
  findUser: (options) => models().User.findOne(options),
  findReports: (options) => models().WeeklyReport.findAll(options),
  findReportById: (id, options) => models().WeeklyReport.findByPk(id, options),
  findReport: (options) => models().WeeklyReport.findOne(options),
  createReport: (values, options) => models().WeeklyReport.create(values, options),
  updateReports: (values, options) => models().WeeklyReport.update(values, options),
  destroyReport: (options) => models().WeeklyReport.destroy(options),
};
