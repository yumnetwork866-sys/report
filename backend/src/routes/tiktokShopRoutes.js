const express = require('express');
const controller = require('../controllers/tiktokShopController');
const { validateBody, validateParams, validateQuery } = require('../middleware/validateRequest');
const {
  applicationParamsSchema,
  authorizationParamsSchema,
  creatorParamsSchema,
  shopAnalyticsBodySchema,
  shopAnalyticsQuerySchema,
  shopListQuerySchema,
  shopParamsSchema,
  shopVideoParamsSchema,
} = require('../schemas/tiktokShopSchemas');

const adminRouter = express.Router();
adminRouter.get('/exchange-rates', controller.getExchangeRates);
adminRouter.get('/oauth/start', controller.startShopOauth);
adminRouter.get('/connections', controller.listShopConnections);
adminRouter.get('/shops', controller.listShops);
adminRouter.delete('/shops/:shopId', validateParams(shopParamsSchema), controller.disconnectShop);
adminRouter.get('/shops/:shopId/analytics', validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.getShopAnalytics);
adminRouter.post('/shops/:shopId/analytics/sync', validateParams(shopParamsSchema), validateBody(shopAnalyticsBodySchema), controller.syncShopAnalytics);
adminRouter.get('/shops/:shopId/video-analytics', validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.listShopVideoPerformance);
adminRouter.post('/shops/:shopId/video-performance/sync', validateParams(shopParamsSchema), validateBody(shopAnalyticsBodySchema), controller.syncVideoPerformanceApi);
adminRouter.get('/shops/:shopId/video-performance', validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.listVideoPerformanceApi);
adminRouter.post('/shops/:shopId/video-export/import', validateParams(shopParamsSchema), controller.importVideoPerformanceExport);
adminRouter.get('/shops/:shopId/video-export', validateParams(shopParamsSchema), controller.listVideoPerformanceExport);
adminRouter.get('/shops/:shopId/video-thumbnails/:videoId', validateParams(shopVideoParamsSchema), controller.getShopVideoThumbnail);
adminRouter.get('/shops/:shopId/affiliate/open-collaborations', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listOpenCollaborations);
adminRouter.get('/shops/:shopId/affiliate/target-collaborations', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listTargetCollaborations);
adminRouter.get('/shops/:shopId/affiliate/orders', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listAffiliateOrders);
adminRouter.get('/shops/:shopId/affiliate/order-overview', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listAffiliateOrderOverview);
adminRouter.get('/shops/:shopId/affiliate/creators', validateParams(shopParamsSchema), controller.listAffiliateCreators);
adminRouter.get('/shops/:shopId/affiliate/creators/:applicationId/fulfillments', validateParams(applicationParamsSchema), controller.showAffiliateCreatorFulfillments);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listMarketplaceCreators);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators/:creatorId', validateParams(creatorParamsSchema), controller.showMarketplaceCreator);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/invitations', validateParams(creatorParamsSchema), controller.createMarketplaceCreatorInvitation);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/invitations/:collaborationId/creators', validateParams(creatorParamsSchema), controller.addMarketplaceCreatorToInvitation);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators/:creatorId/conversation', validateParams(creatorParamsSchema), controller.getMarketplaceCreatorConversation);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/conversation/messages', validateParams(creatorParamsSchema), controller.sendMarketplaceCreatorMessage);
adminRouter.get('/shops/:shopId/affiliate/creator-content-details', validateParams(shopParamsSchema), controller.listCreatorContentDetails);
adminRouter.get('/shops/:shopId/creator-performance', validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listCreatorPerformance);
adminRouter.post('/shops/:shopId/creator-performance/sync', validateParams(shopParamsSchema), controller.syncCreatorPerformance);
adminRouter.get('/shops/:shopId/affiliate/open-collaboration-settings', validateParams(shopParamsSchema), controller.showOpenCollaborationSettings);
adminRouter.delete('/connections/:authorizationId', validateParams(authorizationParamsSchema), controller.disconnectShopAuthorization);

module.exports = { adminRouter };
