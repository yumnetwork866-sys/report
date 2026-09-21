const express = require('express');
const { validateBody, validateParams, validateQuery } = require('../middleware/validateRequest');
const {
  bookingBodySchema, bookingIdParamsSchema, bookingListQuerySchema, creatorIdParamsSchema,
} = require('../schemas/bookingSchemas');
const router = express.Router();
const {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  matchBookingVideo,
  deleteBooking,
  getTargetKocs,
  getTargetKocDetail,
  getTikTokPartnerCollaborations,
  getTikTokPartnerStatuses,
  startTikTokPartnerOauth,
  disconnectTikTokPartner,
  getTikTokPartnerCreatorOverview,
  getBookingProductPerformance,
} = require('../controllers/bookingController');
router.get('/', validateQuery(bookingListQuerySchema), getBookings);
router.get('/product-performance', validateQuery(bookingListQuerySchema), getBookingProductPerformance);
router.get('/target-kocs', getTargetKocs);
router.get('/target-kocs/detail', getTargetKocDetail);
router.get('/tiktok-partner/collaborations', getTikTokPartnerCollaborations);
router.get('/tiktok-partner/status', getTikTokPartnerStatuses);
router.get('/tiktok-partner/oauth/start', startTikTokPartnerOauth);
router.get('/tiktok-partner/creators/:creatorId/overview', validateParams(creatorIdParamsSchema), getTikTokPartnerCreatorOverview);
router.delete('/tiktok-partner/:creatorId', validateParams(creatorIdParamsSchema), disconnectTikTokPartner);
router.get('/:id', validateParams(bookingIdParamsSchema), getBookingById);
router.post('/', validateBody(bookingBodySchema), createBooking);
router.post('/:id/video-match', validateParams(bookingIdParamsSchema), validateBody(bookingBodySchema), matchBookingVideo);
router.put('/:id', validateParams(bookingIdParamsSchema), validateBody(bookingBodySchema), updateBooking);
router.delete('/:id', validateParams(bookingIdParamsSchema), deleteBooking);

module.exports = router;
