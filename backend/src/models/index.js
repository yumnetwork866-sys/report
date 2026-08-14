const { DataTypes } = require('sequelize');
const sequelize = require('../db/config');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'member',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: false,
  defaultScope: {
    attributes: { exclude: ['password_hash'] },
  },
});

const Role = sequelize.define('Role', {
  key: {
    type: DataTypes.STRING(64),
    primaryKey: true,
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_system: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'roles',
  timestamps: false,
});

const ContentTeam = sequelize.define('ContentTeam', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  legacy_key: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'content_teams',
  timestamps: false,
});

const UserContentAttribution = sequelize.define('UserContentAttribution', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  hashtags: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'user_content_attributions',
  timestamps: false,
});

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  staff_name: DataTypes.STRING,
  creator_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  creator_open_id: DataTypes.STRING,
  creator_username: DataTypes.STRING,
  creator_name: DataTypes.STRING,
  creator_avatar_url: DataTypes.TEXT,
  target_shop_id: DataTypes.INTEGER,
  target_collaboration_id: DataTypes.STRING,
  evaluation_snapshot: DataTypes.JSONB,
  booking_cost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  total_cost: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  cost_note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'MYR',
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'booked',
    validate: {
      isIn: [['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']],
    },
  },
  deadline: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  video_platform_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  video_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  posted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'bookings',
  timestamps: false,
  indexes: [
    { fields: ['staff_id'] },
    { fields: ['creator_id'] },
    { fields: ['status'] },
    { fields: ['deadline'] },
  ],
});

const BookingVideo = sequelize.define('BookingVideo', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  booking_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_video_id: { type: DataTypes.STRING(64), allowNull: false },
  video_url: DataTypes.TEXT,
  creator_username: DataTypes.STRING,
  title: DataTypes.TEXT,
  posted_at: DataTypes.DATE,
  attribution_start: { type: DataTypes.DATEONLY, allowNull: false },
  attribution_end: { type: DataTypes.DATEONLY, allowNull: false },
  mapping_source: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'MANUAL_URL' },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'COLLECTING' },
  last_synced_at: DataTypes.DATE,
  last_sync_error: DataTypes.TEXT,
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'booking_videos',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['booking_id', 'platform_video_id'] },
    { fields: ['status', 'attribution_end'] },
  ],
});

const BookingVideoPerformanceSnapshot = sequelize.define('BookingVideoPerformanceSnapshot', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  booking_video_id: { type: DataTypes.BIGINT, allowNull: false },
  snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
  gross_gmv: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  refunded_gmv: DataTypes.DECIMAL(20, 4),
  net_gmv: DataTypes.DECIMAL(20, 4),
  orders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  items_sold: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  views: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  ctr: DataTypes.DECIMAL(12, 6),
  currency: DataTypes.STRING(16),
  raw_metrics: DataTypes.JSONB,
  synced_at: DataTypes.DATE,
}, {
  tableName: 'booking_video_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['booking_video_id', 'snapshot_date'] }],
});

const ShopVideo = sequelize.define('ShopVideo', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_video_id: { type: DataTypes.STRING(64), allowNull: false },
  account_type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'AFFILIATE_ACCOUNTS' },
  creator_username: DataTypes.STRING,
  title: DataTypes.TEXT,
  video_url: DataTypes.TEXT,
  posted_at: DataTypes.DATE,
  first_seen_at: DataTypes.DATE,
  last_seen_at: DataTypes.DATE,
  raw_data: DataTypes.JSONB,
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'shop_videos',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'platform_video_id'] }],
});

const ShopVideoPerformanceSnapshot = sequelize.define('ShopVideoPerformanceSnapshot', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_video_id: { type: DataTypes.BIGINT, allowNull: false },
  snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
  window_start: { type: DataTypes.DATEONLY, allowNull: false },
  window_end: { type: DataTypes.DATEONLY, allowNull: false },
  gross_gmv: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  orders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  items_sold: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  views: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  ctr: DataTypes.DECIMAL(12, 6),
  currency: DataTypes.STRING(16),
  raw_metrics: DataTypes.JSONB,
  synced_at: DataTypes.DATE,
}, {
  tableName: 'shop_video_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_video_id', 'snapshot_date'] }],
});

const ChannelReportVideoRevenueDaily = sequelize.define('ChannelReportVideoRevenueDaily', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_video_id: { type: DataTypes.STRING(64), allowNull: false },
  metric_date: { type: DataTypes.DATEONLY, allowNull: false },
  account_type: { type: DataTypes.STRING(32), allowNull: false },
  revenue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  currency: DataTypes.STRING(16),
  raw_metrics: DataTypes.JSONB,
  synced_at: DataTypes.DATE,
}, {
  tableName: 'channel_report_video_revenue_daily',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'platform_video_id', 'metric_date'] }],
});

const ChannelReportRevenueSyncDay = sequelize.define('ChannelReportRevenueSyncDay', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  metric_date: { type: DataTypes.DATEONLY, allowNull: false },
  video_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  synced_at: DataTypes.DATE,
}, {
  tableName: 'channel_report_revenue_sync_days',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'metric_date'] }],
});

const TikTokAffiliateOrder = sequelize.define('TikTokAffiliateOrder', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  order_id: { type: DataTypes.STRING(64), allowNull: false },
  create_time: { type: DataTypes.DATE, allowNull: false },
  delivery_time: DataTypes.DATE,
  raw_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: DataTypes.DATE,
}, {
  tableName: 'tiktok_affiliate_orders',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'order_id'] }],
});

const TikTokAffiliateOrderSku = sequelize.define('TikTokAffiliateOrderSku', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  affiliate_order_id: { type: DataTypes.BIGINT, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  order_id: { type: DataTypes.STRING(64), allowNull: false },
  sku_id: { type: DataTypes.STRING(128), allowNull: false },
  product_id: DataTypes.STRING(128),
  product_name: DataTypes.TEXT,
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refunded_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  content_type: DataTypes.STRING(32),
  content_id: DataTypes.STRING(128),
  creator_username: DataTypes.STRING,
  price: DataTypes.DECIMAL(20, 4),
  currency: DataTypes.STRING(16),
  settlement_status: DataTypes.STRING(64),
  fully_return: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  raw_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: DataTypes.DATE,
}, {
  tableName: 'tiktok_affiliate_order_skus',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'order_id', 'sku_id'] }],
});

const TikTokAffiliateOrderSyncDay = sequelize.define('TikTokAffiliateOrderSyncDay', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  metric_date: { type: DataTypes.DATEONLY, allowNull: false },
  order_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sku_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  synced_at: DataTypes.DATE,
}, {
  tableName: 'tiktok_affiliate_order_sync_days',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'metric_date'] }],
});

const TikTokPartnerAuthorization = sequelize.define('TikTokPartnerAuthorization', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  creator_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  open_id: { type: DataTypes.STRING, allowNull: true, unique: true },
  user_type: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  granted_scopes: { type: DataTypes.TEXT, allowNull: true },
  access_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
  refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
  access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  shop_id: { type: DataTypes.STRING, allowNull: true },
  username: { type: DataTypes.STRING, allowNull: true },
  avatar_url: { type: DataTypes.TEXT, allowNull: true },
  register_region: { type: DataTypes.STRING, allowNull: true },
  showcase_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  last_synced_at: { type: DataTypes.DATE, allowNull: true },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
  connected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_partner_authorizations',
  timestamps: false,
  indexes: [{ fields: ['creator_id'], unique: true }, { fields: ['open_id'] }],
});

const TikTokShopAuthorization = sequelize.define('TikTokShopAuthorization', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  open_id: { type: DataTypes.STRING, allowNull: true, unique: true },
  user_type: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  granted_scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  access_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
  refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
  access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  connected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'tiktok_shop_authorizations', timestamps: false });

const TikTokShop = sequelize.define('TikTokShop', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  authorization_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_shop_id: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  region: { type: DataTypes.STRING, allowNull: true },
  seller_type: { type: DataTypes.STRING, allowNull: true },
  cipher: { type: DataTypes.TEXT, allowNull: false, unique: true },
  code: { type: DataTypes.STRING, allowNull: true },
  last_synced_at: { type: DataTypes.DATE, allowNull: true },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'tiktok_shops', timestamps: false });

const OrderProductCategory = sequelize.define('OrderProductCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'order_product_categories', timestamps: false });

const OrderProductCategoryItem = sequelize.define('OrderProductCategoryItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  category_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.STRING(128), allowNull: false },
  title: { type: DataTypes.TEXT, allowNull: true },
  image_url: { type: DataTypes.TEXT, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'order_product_category_items', timestamps: false });

const TikTokShopAnalyticsSnapshot = sequelize.define('TikTokShopAnalyticsSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'LOCAL' },
  metrics: { type: DataTypes.JSONB, allowNull: false },
  latest_available_date: { type: DataTypes.DATEONLY, allowNull: true },
  request_id: { type: DataTypes.STRING, allowNull: true },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_shop_analytics_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'start_date', 'end_date', 'currency'] }],
});

const TikTokCreatorPerformanceExport = sequelize.define('TikTokCreatorPerformanceExport', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  task_id: { type: DataTypes.STRING, allowNull: false },
  module_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'CREATOR' },
  window_type: { type: DataTypes.STRING, allowNull: false },
  plan_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ALL' },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PROCESSING' },
  request_id: DataTypes.STRING,
  row_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  error: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completed_at: DataTypes.DATE,
}, { tableName: 'tiktok_creator_performance_exports', timestamps: false });

const TikTokCreatorPerformanceSnapshot = sequelize.define('TikTokCreatorPerformanceSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  export_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  username: { type: DataTypes.STRING, allowNull: false },
  nickname: DataTypes.STRING,
  avatar_url: DataTypes.TEXT,
  creator_open_id: DataTypes.STRING,
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  window_type: { type: DataTypes.STRING, allowNull: false },
  plan_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ALL' },
  currency: { type: DataTypes.STRING, allowNull: false },
  affiliate_gmv: DataTypes.DECIMAL(20, 4),
  live_gmv: DataTypes.DECIMAL(20, 4),
  video_gmv: DataTypes.DECIMAL(20, 4),
  product_card_gmv: DataTypes.DECIMAL(20, 4),
  affiliate_products_sold: DataTypes.INTEGER,
  products_sold: DataTypes.BIGINT,
  items_sold: DataTypes.INTEGER,
  estimated_commission: DataTypes.DECIMAL(20, 4),
  estimated_flat_fee: DataTypes.DECIMAL(20, 4),
  average_order_value: DataTypes.DECIMAL(20, 4),
  product_showcase_count: DataTypes.INTEGER,
  products_added_to_showcase: DataTypes.BIGINT,
  total_sample_content: DataTypes.BIGINT,
  samples_shipped: DataTypes.BIGINT,
  affiliate_orders: DataTypes.INTEGER,
  ctr: DataTypes.DECIMAL(12, 8),
  ctor: DataTypes.DECIMAL(12, 8),
  product_impressions: DataTypes.BIGINT,
  average_affiliate_customers: DataTypes.DECIMAL(20, 4),
  customers: DataTypes.BIGINT,
  video_views: DataTypes.BIGINT,
  live_streams: DataTypes.INTEGER,
  shoppable_videos: DataTypes.INTEGER,
  target_gmv: DataTypes.DECIMAL(20, 4),
  target_estimated_commission: DataTypes.DECIMAL(20, 4),
  open_gmv: DataTypes.DECIMAL(20, 4),
  open_estimated_commission: DataTypes.DECIMAL(20, 4),
  refunded_gmv: DataTypes.DECIMAL(20, 4),
  items_refunded: DataTypes.INTEGER,
  followers: DataTypes.BIGINT,
  raw_metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_creator_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'] }],
});

const TikTokVideoPerformanceSnapshot = sequelize.define('TikTokVideoPerformanceSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  export_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  video_title: DataTypes.TEXT,
  video_id: { type: DataTypes.STRING(128), allowNull: false },
  post_date: DataTypes.STRING(64),
  video_link: DataTypes.TEXT,
  creator_name: DataTypes.STRING,
  product_id: DataTypes.TEXT,
  creator_attributed_gmv: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  attributed_orders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  aov: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  attributed_items_sold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refunds: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  items_refunded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  likes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  comments: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  shares: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  product_impressions: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  product_clicks: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  completion_rate: DataTypes.DECIMAL(12, 6),
  video_views: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  ctr: DataTypes.DECIMAL(12, 6),
  video_gpm: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  engagement: DataTypes.DECIMAL(12, 6),
  avg_gmv_per_customer: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  estimated_commission: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  raw_metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_video_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['export_id', 'video_id'] }],
});

const TikTokCreatorProfile = sequelize.define('TikTokCreatorProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  creator_open_id: DataTypes.STRING,
  username: { type: DataTypes.STRING, allowNull: false },
  nickname: DataTypes.STRING,
  avatar_url: DataTypes.TEXT,
  follower_count: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown' },
  refreshed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_creator_profiles',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'username'] },
    { fields: ['shop_id', 'creator_open_id'] },
  ],
});

const TikTokApiCooldown = sequelize.define('TikTokApiCooldown', {
  shop_id: { type: DataTypes.INTEGER, primaryKey: true },
  namespace: { type: DataTypes.STRING(100), primaryKey: true },
  cooldown_until: { type: DataTypes.DATE, allowNull: false },
  reason: DataTypes.TEXT,
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_api_cooldowns',
  timestamps: false,
});

const TikTokMarketplaceCreatorDetail = sequelize.define('TikTokMarketplaceCreatorDetail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  creator_open_id: { type: DataTypes.STRING, allowNull: false },
  username: DataTypes.STRING,
  detail: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  fetched_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_marketplace_creator_details',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'creator_open_id'] },
    { fields: ['shop_id', 'fetched_at'] },
  ],
});

const TikTokMarketplaceSearchSnapshot = sequelize.define('TikTokMarketplaceSearchSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  cache_key: { type: DataTypes.STRING(64), allowNull: false },
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  fetched_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_marketplace_search_snapshots',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'cache_key'] },
    { fields: ['shop_id', 'fetched_at'] },
  ],
});

const TikTokMarketplaceCreator = sequelize.define('TikTokMarketplaceCreator', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  creator_open_id: { type: DataTypes.STRING, allowNull: false },
  username: DataTypes.STRING,
  nickname: DataTypes.STRING,
  profile: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  first_seen_at: { type: DataTypes.DATE, allowNull: false },
  last_seen_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_marketplace_creators',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'creator_open_id'] },
    { fields: ['shop_id', 'first_seen_at'] },
  ],
});

const TikTokMarketplaceDiscoveryState = sequelize.define('TikTokMarketplaceDiscoveryState', {
  shop_id: { type: DataTypes.INTEGER, primaryKey: true },
  next_page_token: DataTypes.TEXT,
  search_key: DataTypes.TEXT,
  segment_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  crawl_status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'ACTIVE' },
  completed_at: DataTypes.DATE,
  next_refresh_at: DataTypes.DATE,
  consecutive_rate_limits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  recovery_successes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  segment_page_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  consecutive_duplicate_pages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  last_requested_at: DataTypes.DATE,
  last_succeeded_at: DataTypes.DATE,
  last_status: DataTypes.STRING(32),
  last_error: DataTypes.TEXT,
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'tiktok_marketplace_discovery_states', timestamps: false });

const TikTokMarketplaceDiscoveryRun = sequelize.define('TikTokMarketplaceDiscoveryRun', {
  shop_id: { type: DataTypes.INTEGER, primaryKey: true },
  scheduled_minute: { type: DataTypes.DATE, primaryKey: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'PROCESSING' },
  creator_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  error: DataTypes.TEXT,
  started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completed_at: DataTypes.DATE,
}, { tableName: 'tiktok_marketplace_discovery_runs', timestamps: false });

const TikTokCreatorContactHistory = sequelize.define('TikTokCreatorContactHistory', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  creator_open_id: DataTypes.STRING,
  username: { type: DataTypes.STRING, allowNull: false },
  last_invited_at: DataTypes.DATE,
  last_messaged_at: DataTypes.DATE,
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_creator_contact_histories',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'username'] },
    { fields: ['shop_id', 'creator_open_id'] },
  ],
});

const TikTokTargetCollaborationSnapshot = sequelize.define('TikTokTargetCollaborationSnapshot', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  collaboration_id: { type: DataTypes.STRING, allowNull: false },
  name: DataTypes.STRING(500),
  status: DataTypes.STRING(64),
  start_at: DataTypes.DATE,
  end_at: DataTypes.DATE,
  raw_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_target_collaboration_snapshots',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['shop_id', 'collaboration_id'] },
    { fields: ['shop_id', 'status', 'end_at'] },
  ],
});

const TikTokBasePerformanceSnapshot = sequelize.define('TikTokBasePerformanceSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  export_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  window_type: { type: DataTypes.STRING, allowNull: false },
  currency: { type: DataTypes.STRING, allowNull: false },
  creator_attributed_gmv: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  creator_attributed_items_sold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refunds: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  estimated_commission: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  videos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  live_streams: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  samples_shipped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  items_refunded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  average_order_value: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0 },
  raw_metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_base_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'start_date', 'end_date', 'window_type'] }],
});

const ScheduledJob = sequelize.define('ScheduledJob', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  timezone: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Asia/Ho_Chi_Minh' },
  run_times: { type: DataTypes.JSONB, allowNull: false, defaultValue: ['03:00'] },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'scheduled_jobs', timestamps: false });

const ScheduledJobRun = sequelize.define('ScheduledJobRun', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  scheduled_job_id: { type: DataTypes.INTEGER, allowNull: false },
  trigger_type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'SCHEDULED' },
  scheduled_key: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'PROCESSING' },
  started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completed_at: DataTypes.DATE,
  summary: DataTypes.JSONB,
  error: DataTypes.TEXT,
}, {
  tableName: 'scheduled_job_runs',
  timestamps: false,
  indexes: [{ unique: true, fields: ['scheduled_job_id', 'scheduled_key'] }],
});

const TikTokChannel = sequelize.define('TikTokChannel', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'tiktok',
    validate: {
      isIn: [['tiktok', 'youtube', 'facebook']],
    },
  },
  tiktok_open_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  creator_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  avatar_large_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  bio_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  follower_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  following_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  likes_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  video_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  profile_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  access_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  refresh_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refresh_token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_sync_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_sync_status: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['success', 'failed']],
    },
  },
  last_sync_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  sync_source: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'import',
    validate: {
      isIn: [['oauth', 'import', 'crawler']],
    },
  },
  content_attribution_rules: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
}, {
  tableName: 'tiktok_channels',
  timestamps: false,
});

const Video = sequelize.define('Video', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'tiktok',
  },
  platform_video_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  channel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  video_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  thumbnail_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  shares: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  campaign: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  content_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'videos',
  timestamps: false,
  indexes: [
    { name: 'videos_platform_video_id_key', unique: true, fields: ['platform_video_id'] },
    { name: 'videos_published_at_idx', fields: ['published_at'] },
    { name: 'videos_channel_id_idx', fields: ['channel_id'] },
  ],
});

const VideoAssignment = sequelize.define('VideoAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  assignment_role: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['script', 'editor', 'uploader', 'actor', 'ai_creator']],
    },
  },
}, {
  tableName: 'video_assignments',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['video_id', 'user_id', 'assignment_role'],
    },
    {
      fields: ['user_id', 'video_id'],
    },
  ],
});

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'products',
  timestamps: false,
});

const VideoProduct = sequelize.define('VideoProduct', {
  video_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
}, {
  tableName: 'video_products',
  timestamps: false,
});

const VideoDailyStats = sequelize.define('VideoDailyStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  shares: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'video_daily_stats',
  timestamps: false,
  indexes: [
    { fields: ['video_id', 'date'], unique: true },
    { fields: ['date'] },
  ],
});

const WeeklyReport = sequelize.define('WeeklyReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  week_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  week_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  generated_content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  public_share_token: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  },
}, {
  tableName: 'weekly_reports',
  timestamps: false,
});

const FacebookPage = sequelize.define('FacebookPage', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  access_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  owner_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  owner_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'facebook_pages',
  timestamps: false,
});

const FacebookOauthState = sequelize.define('FacebookOauthState', {
  state: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'facebook_oauth_states',
  timestamps: false,
});

const FacebookUserSession = sequelize.define('FacebookUserSession', {
  sid: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  user_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  user_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'facebook_user_sessions',
  timestamps: false,
});

const ChatbotMessage = sequelize.define('ChatbotMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sender_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  page_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  direction: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['in', 'out']],
    },
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  via: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'system',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_messages',
  timestamps: false,
});

const ChatbotOrder = sequelize.define('ChatbotOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sender_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  page_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  raw: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'new',
    validate: {
      isIn: [['new', 'confirmed', 'done', 'cancelled']],
    },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_orders',
  timestamps: false,
});


const ChatbotKnowledgeDoc = sequelize.define('ChatbotKnowledgeDoc', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  embedding: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_knowledge_docs',
  timestamps: false,
});

const ChatbotSetting = sequelize.define('ChatbotSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'gemini',
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ollama_host: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_settings',
  timestamps: false,
});

User.hasMany(Booking, { foreignKey: 'staff_id', as: 'staff_bookings' });
Booking.belongsTo(User, { foreignKey: 'staff_id', as: 'staff' });
User.hasMany(Booking, { foreignKey: 'creator_id', as: 'creator_bookings' });
Booking.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });
Booking.hasMany(BookingVideo, { foreignKey: 'booking_id', as: 'booking_videos' });
BookingVideo.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });
BookingVideo.hasMany(BookingVideoPerformanceSnapshot, { foreignKey: 'booking_video_id', as: 'performance_snapshots' });
BookingVideoPerformanceSnapshot.belongsTo(BookingVideo, { foreignKey: 'booking_video_id', as: 'booking_video' });
User.hasOne(TikTokPartnerAuthorization, { foreignKey: 'creator_id', as: 'tiktok_partner_authorization' });
TikTokPartnerAuthorization.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });
TikTokShopAuthorization.hasMany(TikTokShop, { foreignKey: 'authorization_id', as: 'shops' });
TikTokShop.belongsTo(TikTokShopAuthorization, { foreignKey: 'authorization_id', as: 'authorization' });
TikTokShop.hasMany(TikTokShopAnalyticsSnapshot, { foreignKey: 'shop_id', as: 'analytics_snapshots' });
TikTokShopAnalyticsSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(OrderProductCategory, { foreignKey: 'shop_id', as: 'order_product_categories' });
OrderProductCategory.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
OrderProductCategory.hasMany(OrderProductCategoryItem, { foreignKey: 'category_id', as: 'products' });
OrderProductCategoryItem.belongsTo(OrderProductCategory, { foreignKey: 'category_id', as: 'category' });
TikTokShop.hasMany(ShopVideo, { foreignKey: 'shop_id', as: 'shop_videos' });
ShopVideo.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
ShopVideo.hasMany(ShopVideoPerformanceSnapshot, { foreignKey: 'shop_video_id', as: 'performance_snapshots' });
ShopVideoPerformanceSnapshot.belongsTo(ShopVideo, { foreignKey: 'shop_video_id', as: 'shop_video' });
TikTokShop.hasMany(ChannelReportVideoRevenueDaily, { foreignKey: 'shop_id', as: 'channel_report_video_revenue_daily' });
ChannelReportVideoRevenueDaily.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(ChannelReportRevenueSyncDay, { foreignKey: 'shop_id', as: 'channel_report_revenue_sync_days' });
ChannelReportRevenueSyncDay.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokAffiliateOrder, { foreignKey: 'shop_id', as: 'affiliate_orders' });
TikTokAffiliateOrder.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokAffiliateOrder.hasMany(TikTokAffiliateOrderSku, { foreignKey: 'affiliate_order_id', as: 'skus' });
TikTokAffiliateOrderSku.belongsTo(TikTokAffiliateOrder, { foreignKey: 'affiliate_order_id', as: 'order' });
TikTokShop.hasMany(TikTokAffiliateOrderSku, { foreignKey: 'shop_id', as: 'affiliate_order_skus' });
TikTokAffiliateOrderSku.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokAffiliateOrderSyncDay, { foreignKey: 'shop_id', as: 'affiliate_order_sync_days' });
TikTokAffiliateOrderSyncDay.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokCreatorPerformanceExport, { foreignKey: 'shop_id', as: 'creator_performance_exports' });
TikTokCreatorPerformanceExport.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokCreatorPerformanceSnapshot, { foreignKey: 'shop_id', as: 'creator_performance_snapshots' });
TikTokCreatorPerformanceSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokCreatorPerformanceExport.hasMany(TikTokCreatorPerformanceSnapshot, { foreignKey: 'export_id', as: 'creators' });
TikTokCreatorPerformanceSnapshot.belongsTo(TikTokCreatorPerformanceExport, { foreignKey: 'export_id', as: 'export' });
TikTokCreatorPerformanceExport.hasMany(TikTokVideoPerformanceSnapshot, { foreignKey: 'export_id', as: 'videos' });
TikTokVideoPerformanceSnapshot.belongsTo(TikTokCreatorPerformanceExport, { foreignKey: 'export_id', as: 'export' });
TikTokShop.hasMany(TikTokCreatorProfile, { foreignKey: 'shop_id', as: 'creator_profiles' });
TikTokCreatorProfile.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokApiCooldown, { foreignKey: 'shop_id', as: 'api_cooldowns' });
TikTokApiCooldown.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokMarketplaceCreatorDetail, { foreignKey: 'shop_id', as: 'marketplace_creator_details' });
TikTokMarketplaceCreatorDetail.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokMarketplaceSearchSnapshot, { foreignKey: 'shop_id', as: 'marketplace_search_snapshots' });
TikTokMarketplaceSearchSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokMarketplaceCreator, { foreignKey: 'shop_id', as: 'marketplace_creators' });
TikTokMarketplaceCreator.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasOne(TikTokMarketplaceDiscoveryState, { foreignKey: 'shop_id', as: 'marketplace_discovery_state' });
TikTokMarketplaceDiscoveryState.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokMarketplaceDiscoveryRun, { foreignKey: 'shop_id', as: 'marketplace_discovery_runs' });
TikTokMarketplaceDiscoveryRun.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokCreatorContactHistory, { foreignKey: 'shop_id', as: 'creator_contact_histories' });
TikTokCreatorContactHistory.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokTargetCollaborationSnapshot, { foreignKey: 'shop_id', as: 'target_collaboration_snapshots' });
TikTokTargetCollaborationSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokBasePerformanceSnapshot, { foreignKey: 'shop_id', as: 'base_performance_snapshots' });
TikTokBasePerformanceSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokCreatorPerformanceExport.hasOne(TikTokBasePerformanceSnapshot, { foreignKey: 'export_id', as: 'base_snapshot' });
TikTokBasePerformanceSnapshot.belongsTo(TikTokCreatorPerformanceExport, { foreignKey: 'export_id', as: 'export' });
ScheduledJob.hasMany(ScheduledJobRun, { foreignKey: 'scheduled_job_id', as: 'runs' });
ScheduledJobRun.belongsTo(ScheduledJob, { foreignKey: 'scheduled_job_id', as: 'job' });

TikTokChannel.hasMany(Video, { foreignKey: 'channel_id', as: 'videos' });
Video.belongsTo(TikTokChannel, { foreignKey: 'channel_id', as: 'channel' });
User.hasOne(TikTokChannel, { foreignKey: 'creator_id', as: 'tiktok_channel' });
TikTokChannel.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });

Video.hasMany(VideoAssignment, { foreignKey: 'video_id', as: 'assignments' });
VideoAssignment.belongsTo(Video, { foreignKey: 'video_id', as: 'video' });
User.hasMany(VideoAssignment, { foreignKey: 'user_id', as: 'assignments' });
VideoAssignment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(UserContentAttribution, { foreignKey: 'user_id', as: 'content_attribution' });
UserContentAttribution.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ContentTeam.hasMany(UserContentAttribution, { foreignKey: 'team_id', as: 'user_attributions' });
UserContentAttribution.belongsTo(ContentTeam, { foreignKey: 'team_id', as: 'team' });

Video.belongsToMany(Product, {
  through: VideoProduct,
  foreignKey: 'video_id',
  otherKey: 'product_id',
  as: 'products',
});
Product.belongsToMany(Video, {
  through: VideoProduct,
  foreignKey: 'product_id',
  otherKey: 'video_id',
  as: 'videos',
});

Video.hasMany(VideoDailyStats, { foreignKey: 'video_id', as: 'daily_stats' });
VideoDailyStats.belongsTo(Video, { foreignKey: 'video_id', as: 'video' });

FacebookPage.hasMany(ChatbotMessage, { foreignKey: 'page_id', as: 'messages' });
ChatbotMessage.belongsTo(FacebookPage, { foreignKey: 'page_id', as: 'page' });
FacebookPage.hasMany(ChatbotOrder, { foreignKey: 'page_id', as: 'orders' });
ChatbotOrder.belongsTo(FacebookPage, { foreignKey: 'page_id', as: 'page' });

module.exports = {
  User,
  Role,
  ContentTeam,
  UserContentAttribution,
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  ShopVideo,
  ShopVideoPerformanceSnapshot,
  ChannelReportVideoRevenueDaily,
  ChannelReportRevenueSyncDay,
  TikTokAffiliateOrder,
  TikTokAffiliateOrderSku,
  TikTokAffiliateOrderSyncDay,
  TikTokPartnerAuthorization,
  TikTokShopAuthorization,
  TikTokShop,
  OrderProductCategory,
  OrderProductCategoryItem,
  TikTokShopAnalyticsSnapshot,
  TikTokCreatorPerformanceExport,
  TikTokCreatorPerformanceSnapshot,
  TikTokVideoPerformanceSnapshot,
  TikTokCreatorProfile,
  TikTokApiCooldown,
  TikTokMarketplaceCreatorDetail,
  TikTokMarketplaceSearchSnapshot,
  TikTokMarketplaceCreator,
  TikTokMarketplaceDiscoveryState,
  TikTokMarketplaceDiscoveryRun,
  TikTokCreatorContactHistory,
  TikTokTargetCollaborationSnapshot,
  TikTokBasePerformanceSnapshot,
  ScheduledJob,
  ScheduledJobRun,
  TikTokChannel,
  Video,
  VideoAssignment,
  Product,
  VideoProduct,
  VideoDailyStats,
  WeeklyReport,
  FacebookPage,
  FacebookOauthState,
  FacebookUserSession,
  ChatbotMessage,
  ChatbotOrder,

  ChatbotKnowledgeDoc,
  ChatbotSetting,
  Report: WeeklyReport,
  sequelize,
};
