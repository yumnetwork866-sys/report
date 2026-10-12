const express = require('express');
const controller = require('../controllers/tiktokShopController');
const { requireAnyPermission, requirePermission } = require('../lib/session');
const { validateBody, validateParams, validateQuery } = require('../middleware/validateRequest');
const {
  applicationParamsSchema,
  authorizationParamsSchema,
  creatorParamsSchema,
  shopAvatarChannelBodySchema,
  shopAnalyticsBodySchema,
  shopAnalyticsQuerySchema,
  shopListQuerySchema,
  shopOrderParamsSchema,
  shopParamsSchema,
  shopVideoParamsSchema,
} = require('../schemas/tiktokShopSchemas');

const adminRouter = express.Router();
adminRouter.get('/exchange-rates', controller.getExchangeRates);
adminRouter.get('/oauth/start', requirePermission('admin.shops.manage'), controller.startShopOauth);
adminRouter.get('/connections', controller.listShopConnections);
adminRouter.get('/shops', controller.listShops);
adminRouter.patch('/shops/:shopId/avatar-channel', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), validateBody(shopAvatarChannelBodySchema), controller.updateShopAvatarChannel);
adminRouter.delete('/shops/:shopId', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), controller.disconnectShop);
adminRouter.get('/shops/:shopId/analytics', requirePermission('shop.analytics.view'), validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.getShopAnalytics);
adminRouter.post('/shops/:shopId/analytics/sync', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), validateBody(shopAnalyticsBodySchema), controller.syncShopAnalytics);
adminRouter.get('/shops/:shopId/video-analytics', requirePermission('shop.videos.performance.view'), validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.listShopVideoPerformance);
adminRouter.post('/shops/:shopId/video-performance/sync', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), validateBody(shopAnalyticsBodySchema), controller.syncVideoPerformanceApi);
adminRouter.get('/shops/:shopId/video-performance', requirePermission('shop.videos.performance.view'), validateParams(shopParamsSchema), validateQuery(shopAnalyticsQuerySchema), controller.listVideoPerformanceApi);
adminRouter.post('/shops/:shopId/video-export/import', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), controller.importVideoPerformanceExport);
adminRouter.get('/shops/:shopId/video-export', requirePermission('shop.videos.library.view'), validateParams(shopParamsSchema), controller.listVideoPerformanceExport);
adminRouter.get('/shops/:shopId/video-thumbnails/:videoId', requireAnyPermission(['shop.videos.library.view', 'shop.videos.performance.view']), validateParams(shopVideoParamsSchema), controller.getShopVideoThumbnail);
adminRouter.get('/shops/:shopId/affiliate/open-collaborations', requireAnyPermission(['shop.affiliate.open.view', 'shop.bookings.manage']), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listOpenCollaborations);
adminRouter.get('/shops/:shopId/affiliate/target-collaborations', requirePermission('shop.affiliate.target.view'), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listTargetCollaborations);
adminRouter.get('/shops/:shopId/affiliate/orders', requirePermission('shop.orders.view'), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listAffiliateOrders);
adminRouter.get('/shops/:shopId/affiliate/order-overview', requirePermission('shop.orders.view'), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listAffiliateOrderOverview);
adminRouter.get('/shops/:shopId/orders/:orderId/tracking', requirePermission('shop.orders.view'), validateParams(shopOrderParamsSchema), controller.getOrderTracking);
adminRouter.get('/shops/:shopId/affiliate/creators', requirePermission('shop.affiliate.creators.view'), validateParams(shopParamsSchema), controller.listAffiliateCreators);
adminRouter.get('/shops/:shopId/affiliate/creators/:applicationId/fulfillments', requirePermission('shop.affiliate.creators.view'), validateParams(applicationParamsSchema), controller.showAffiliateCreatorFulfillments);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators', requirePermission('shop.affiliate.discovery.view'), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listMarketplaceCreators);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators/:creatorId', requirePermission('shop.affiliate.discovery.view'), validateParams(creatorParamsSchema), controller.showMarketplaceCreator);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/invitations', requirePermission('shop.affiliate.invite'), validateParams(creatorParamsSchema), controller.createMarketplaceCreatorInvitation);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/invitations/:collaborationId/creators', requirePermission('shop.affiliate.invite'), validateParams(creatorParamsSchema), controller.addMarketplaceCreatorToInvitation);
adminRouter.get('/shops/:shopId/affiliate/marketplace-creators/:creatorId/conversation', requireAnyPermission(['shop.affiliate.discovery.view', 'shop.affiliate.message']), validateParams(creatorParamsSchema), controller.getMarketplaceCreatorConversation);
adminRouter.post('/shops/:shopId/affiliate/marketplace-creators/:creatorId/conversation/messages', requirePermission('shop.affiliate.message'), validateParams(creatorParamsSchema), controller.sendMarketplaceCreatorMessage);
adminRouter.get('/shops/:shopId/affiliate/creator-content-details', requirePermission('shop.affiliate.creators.view'), validateParams(shopParamsSchema), controller.listCreatorContentDetails);
adminRouter.get('/shops/:shopId/creator-performance', requirePermission('shop.affiliate.performance.view'), validateParams(shopParamsSchema), validateQuery(shopListQuerySchema), controller.listCreatorPerformance);
adminRouter.post('/shops/:shopId/creator-performance/sync', requirePermission('admin.shops.manage'), validateParams(shopParamsSchema), controller.syncCreatorPerformance);
adminRouter.get('/shops/:shopId/affiliate/open-collaboration-settings', requirePermission('shop.affiliate.open.view'), validateParams(shopParamsSchema), controller.showOpenCollaborationSettings);
adminRouter.delete('/connections/:authorizationId', requirePermission('admin.shops.manage'), validateParams(authorizationParamsSchema), controller.disconnectShopAuthorization);

module.exports = { adminRouter };
