const express = require('express');
const router = express.Router();
const {
  startTiktokOauth,
  handleTiktokOauthCallback,
  handleTiktokWebhook,
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  syncChannelVideos,
  revokeChannelAuthorization,
  deleteChannel,
} = require('../controllers/channelController');
const { requireAdmin, requireAnyPermission, requirePermission } = require('../lib/session');

router.get('/oauth/tiktok/callback', handleTiktokOauthCallback);
router.post('/webhook/tiktok', handleTiktokWebhook);
router.use(requireAdmin, requireAnyPermission(['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view', 'channels.manage']));
router.get('/oauth/tiktok/start', requirePermission('channels.manage'), startTiktokOauth);
router.get('/', getChannels);
router.get('/:id', getChannelById);
router.post('/', requirePermission('channels.manage'), createChannel);
router.put('/:id', requirePermission('channels.manage'), updateChannel);
router.post('/:id/sync-videos', requirePermission('channels.manage'), syncChannelVideos);
router.post('/:id/revoke', requirePermission('channels.manage'), revokeChannelAuthorization);
router.delete('/:id', requirePermission('channels.manage'), deleteChannel);

module.exports = router;
