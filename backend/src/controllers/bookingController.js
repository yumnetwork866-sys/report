const bookingService = require('../services/booking/bookingEndpointService');
const { endpoint } = require('./controllerAdapter');

module.exports = {
  getBookings: endpoint(bookingService, 'getBookings'),
  getBookingById: endpoint(bookingService, 'getBookingById'),
  getBookingProductPerformance: endpoint(bookingService, 'getBookingProductPerformance'),
  createBooking: endpoint(bookingService, 'createBooking'),
  updateBooking: endpoint(bookingService, 'updateBooking'),
  matchBookingVideo: endpoint(bookingService, 'matchBookingVideo'),
  deleteBooking: endpoint(bookingService, 'deleteBooking'),
  getTargetKocs: endpoint(bookingService, 'getTargetKocs'),
  getTargetKocDetail: endpoint(bookingService, 'getTargetKocDetail'),
  getTikTokPartnerCollaborations: endpoint(bookingService, 'getTikTokPartnerCollaborations'),
  getTikTokPartnerStatuses: endpoint(bookingService, 'getTikTokPartnerStatuses'),
  startTikTokPartnerOauth: endpoint(bookingService, 'startTikTokPartnerOauth'),
  handleTikTokPartnerOauthCallback: endpoint(bookingService, 'handleTikTokPartnerOauthCallback'),
  disconnectTikTokPartner: endpoint(bookingService, 'disconnectTikTokPartner'),
  getTikTokPartnerCreatorOverview: endpoint(bookingService, 'getTikTokPartnerCreatorOverview'),
  __test: bookingService.__test,
};
