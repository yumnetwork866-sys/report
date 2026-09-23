const models = () => require('../models');

module.exports = {
  query: (...args) => models().sequelize.query(...args),
  transaction: (...args) => models().sequelize.transaction(...args),
  findChannels: (options) => models().TikTokChannel.findAll(options),
  findShopAuthorizations: (options) => models().TikTokShopAuthorization.findAll(options),
  findShopAuthorizationsWithShops: (options = {}) => models().TikTokShopAuthorization.findAll({
    ...options,
    include: [
      { model: models().TikTokShop, as: 'shops', attributes: { exclude: ['cipher'] } },
      { model: models().TikTokShop, as: 'order_shops', attributes: { exclude: ['cipher'] } },
    ],
  }),
  findShopAuthorization: (options) => models().TikTokShopAuthorization.findOne(options),
  createShopAuthorization: (values, options) => models().TikTokShopAuthorization.create(values, options),
  destroyShopAuthorizations: (options) => models().TikTokShopAuthorization.destroy(options),
  findShop: (options) => models().TikTokShop.findOne(options),
  findShops: (options) => models().TikTokShop.findAll(options),
  findShopsWithAuthorization: (options = {}) => models().TikTokShop.findAll({
    ...options,
    include: [
      {
        model: models().TikTokShopAuthorization,
        as: 'authorization',
        attributes: ['id', 'granted_scopes', 'refresh_token_expires_at', 'app_type', 'connected_at'],
      },
      {
        model: models().TikTokShopAuthorization,
        as: 'orderAuthorization',
        attributes: ['id', 'granted_scopes', 'refresh_token_expires_at', 'app_type', 'connected_at'],
      },
    ],
  }),
  findShopWithAuthorization: (id, options = {}) => models().TikTokShop.findByPk(id, {
    ...options,
    include: [
      { model: models().TikTokShopAuthorization, as: 'authorization' },
      { model: models().TikTokShopAuthorization, as: 'orderAuthorization' },
    ],
  }),
  findShopById: (id, options) => models().TikTokShop.findByPk(id, options),
  countShops: (options) => models().TikTokShop.count(options),
  upsertShop: (values, options) => models().TikTokShop.upsert(values, options),
  updateShops: (values, options) => models().TikTokShop.update(values, options),
  destroyShops: (options) => models().TikTokShop.destroy(options),
  findShopAnalytics: (options) => models().TikTokShopAnalyticsSnapshot.findAll(options),
  findShopAnalyticsSnapshot: (options) => models().TikTokShopAnalyticsSnapshot.findOne(options),
  upsertShopAnalyticsSnapshot: (values, options) => models().TikTokShopAnalyticsSnapshot.upsert(values, options),
  findCreatorPerformanceExport: (options) => models().TikTokCreatorPerformanceExport.findOne(options),
  findCreatorPerformance: (options) => models().TikTokCreatorPerformanceSnapshot.findOne(options),
  findAndCountCreatorPerformance: (options) => models().TikTokCreatorPerformanceSnapshot.findAndCountAll(options),
  findBasePerformance: (options) => models().TikTokBasePerformanceSnapshot.findOne(options),
  findAndCountVideoPerformance: (options) => models().TikTokVideoPerformanceSnapshot.findAndCountAll(options),
  findMarketplaceCreator: (options) => models().TikTokMarketplaceCreator.findOne(options),
  findMarketplaceCreatorDetail: (options) => models().TikTokMarketplaceCreatorDetail.findOne(options),
  findMarketplaceDiscoveryStateById: (id, options) => models().TikTokMarketplaceDiscoveryState.findByPk(id, options),
  findTargetCollaborations: (options) => models().TikTokTargetCollaborationSnapshot.findAll(options),
  findAndCountTargetCollaborations: (options) => models().TikTokTargetCollaborationSnapshot.findAndCountAll(options),
  findAndCountAffiliateOrders: (options = {}, skuWhere, skuRequired = false) => models().TikTokAffiliateOrder.findAndCountAll({
    ...options,
    include: [{
      model: models().TikTokAffiliateOrderSku,
      as: 'skus',
      where: skuWhere,
      required: skuRequired,
    }],
  }),
  findAffiliateOrders: (options) => models().TikTokAffiliateOrder.findAll(options),
  findAffiliateOrderSkus: (options) => models().TikTokAffiliateOrderSku.findAll(options),
  findCreatorProfiles: (options) => models().TikTokCreatorProfile.findAll(options),
  findShopProducts: (options) => models().TikTokShopProduct.findAll(options),
  findShopVideo: (options) => models().ShopVideo.findOne(options),
};
