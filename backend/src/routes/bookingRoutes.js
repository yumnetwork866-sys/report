const express = require('express');
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
} = require('../controllers/bookingController');
router.get('/', getBookings);
router.get('/target-kocs', getTargetKocs);
router.get('/target-kocs/detail', getTargetKocDetail);
router.get('/tiktok-partner/collaborations', getTikTokPartnerCollaborations);
router.get('/tiktok-partner/status', getTikTokPartnerStatuses);
router.get('/tiktok-partner/oauth/start', startTikTokPartnerOauth);
router.get('/tiktok-partner/creators/:creatorId/overview', getTikTokPartnerCreatorOverview);
router.delete('/tiktok-partner/:creatorId', disconnectTikTokPartner);
router.get('/:id', getBookingById);
router.post('/', createBooking);
router.post('/:id/video-match', matchBookingVideo);
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);

module.exports = router;
