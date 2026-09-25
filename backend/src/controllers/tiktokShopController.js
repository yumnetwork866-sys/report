const tiktokShopService = require('../services/tiktokShop/tiktokShopEndpointService');
const { endpoint } = require('./controllerAdapter');

const actions = [
  'startShopOauth', 'handleShopOauthCallback', 'listShopConnections', 'listShops', 'updateShopAvatarChannel',
  'getShopAnalytics', 'syncShopAnalytics', 'disconnectShopAuthorization', 'disconnectShop',
  'listShopVideoPerformance', 'getShopVideoThumbnail', 'listOpenCollaborations',
  'listTargetCollaborations', 'listAffiliateOrders', 'listAffiliateOrderOverview',
  'showOpenCollaborationSettings', 'listAffiliateCreators', 'showAffiliateCreatorFulfillments',
  'getOrderTracking', 'listMarketplaceCreators', 'showMarketplaceCreator', 'createMarketplaceCreatorInvitation',
  'addMarketplaceCreatorToInvitation', 'getMarketplaceCreatorConversation',
  'sendMarketplaceCreatorMessage', 'listCreatorContentDetails', 'listCreatorPerformance',
  'syncCreatorPerformance', 'syncVideoPerformanceApi', 'listVideoPerformanceApi',
  'importVideoPerformanceExport', 'listVideoPerformanceExport', 'getExchangeRates',
];

module.exports = Object.fromEntries(actions.map((action) => [action, endpoint(tiktokShopService, action)]));
module.exports.__test = tiktokShopService.__test;
