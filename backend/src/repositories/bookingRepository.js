const {
  Op, QueryTypes, literal,
} = require('sequelize');
const {
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  ShopVideo,
  ShopVideoPerformanceSnapshot,
  TikTokCreatorPerformanceSnapshot,
  TikTokCreatorPerformanceExport,
  TikTokVideoPerformanceSnapshot,
  TikTokPartnerAuthorization,
  TikTokShop,
  TikTokTargetCollaborationSnapshot,
  User,
  sequelize,
} = require('../models');

const bookingInclude = [
  { model: User, as: 'staff' },
  { model: User, as: 'creator' },
  { model: TikTokShop, as: 'target_shop', attributes: ['id', 'name', 'code', 'region'] },
  {
    model: BookingVideo,
    as: 'booking_videos',
    required: false,
    include: [{
      model: BookingVideoPerformanceSnapshot,
      as: 'performance_snapshots',
      required: false,
    }],
  },
];

const findByIdWithRelations = (bookingId) => Booking.findByPk(bookingId, {
  include: bookingInclude,
});

const findById = (bookingId) => Booking.findByPk(bookingId);
const updateInstance = (booking, payload) => booking.update(payload);
const query = (...args) => sequelize.query(...args);
const findBookings = (options = {}) => Booking.findAll({ ...options, include: bookingInclude });
const findSellerShop = () => TikTokShop.findOne({ order: [['id', 'ASC']] });
const findVideoPerformanceExports = (options) => (
  TikTokCreatorPerformanceExport?.findAll ? TikTokCreatorPerformanceExport.findAll(options) : Promise.resolve([])
);
const findVideoPerformanceSnapshots = (options) => (
  TikTokVideoPerformanceSnapshot?.findAll ? TikTokVideoPerformanceSnapshot.findAll(options) : Promise.resolve([])
);
const findCreatorPerformanceSnapshots = (options) => (
  TikTokCreatorPerformanceSnapshot?.findAll ? TikTokCreatorPerformanceSnapshot.findAll(options) : Promise.resolve([])
);
const findPartnerAuthorization = (options) => TikTokPartnerAuthorization.findOne(options);
const createPartnerAuthorization = (values) => TikTokPartnerAuthorization.create(values);
const updatePartnerAuthorizations = (values, options) => TikTokPartnerAuthorization.update(values, options);
const destroyPartnerAuthorizations = (options) => TikTokPartnerAuthorization.destroy(options);
const findKocs = (options = {}) => User.findAll({
  ...options,
  include: [{ model: TikTokPartnerAuthorization, as: 'tiktok_partner_authorization', required: false }],
});
const findKoc = (options) => User.findOne(options);
const findUserById = (id) => User.findByPk(id);
const createKoc = (values) => User.create(values);

const findStaffById = (staffId) => User.findByPk(staffId, {
  attributes: ['id', 'name'],
});

const create = (payload) => Booking.create(payload);

const updateById = (bookingId, payload) => Booking.update(payload, {
  where: { id: bookingId },
  individualHooks: true,
  validate: true,
});

const findForProductPerformance = () => Booking.findAll({
  where: { evaluation_snapshot: { [Op.not]: null } },
  attributes: ['id', 'target_shop_id', 'creator_username', 'currency', 'evaluation_snapshot'],
});

const deleteById = (bookingId) => Booking.destroy({
  where: { id: bookingId },
});

const findTargetCollaborations = async ({ shopId, collaborationId }) => {
  if (collaborationId) {
    const row = await TikTokTargetCollaborationSnapshot.findOne({
      where: { shop_id: shopId, collaboration_id: collaborationId },
    });
    return row ? [row] : [];
  }
  if (!TikTokTargetCollaborationSnapshot?.findAll) return [];
  return TikTokTargetCollaborationSnapshot.findAll({
    where: {
      shop_id: shopId,
      status: { [Op.in]: ['ONGOING', 'VALID', 'EXPIRING'] },
    },
    order: [['end_at', 'DESC'], ['synced_at', 'DESC']],
  });
};

const performanceOrder = [
  [literal(`CASE "window_type" WHEN 'PAST_30_DAYS' THEN 0 WHEN 'PAST_7_DAYS' THEN 1 WHEN 'PAST_24H' THEN 2 ELSE 3 END`), 'ASC'],
  ['end_date', 'DESC'],
  ['synced_at', 'DESC'],
  ['id', 'DESC'],
];

const findCreatorPerformance = ({
  shopId,
  creatorOpenId,
  username,
  windowType,
  preferDefaultWindows = false,
}) => TikTokCreatorPerformanceSnapshot.findOne({
  where: {
    shop_id: shopId,
    window_type: preferDefaultWindows
      ? { [Op.in]: ['PAST_30_DAYS', 'PAST_7_DAYS', 'PAST_24H'] }
      : windowType,
    [Op.or]: [
      ...(creatorOpenId ? [{ creator_open_id: creatorOpenId }] : []),
      ...(username ? [{ username: { [Op.iLike]: username } }] : []),
    ],
  },
  order: preferDefaultWindows ? performanceOrder : [
    ['end_date', 'DESC'],
    ['synced_at', 'DESC'],
    ['id', 'DESC'],
  ],
});

const findCreatorVideoMetrics = async ({ shopId, username, periodDays }) => {
  if (!sequelize?.query) return null;
  const rows = await sequelize.query(`
    WITH latest_export AS (
      SELECT id
      FROM tiktok_creator_performance_exports
      WHERE shop_id = :shopId
        AND module_type = 'VIDEO_API'
        AND status = 'SUCCEEDED'
        AND end_date - start_date = :periodDays
      ORDER BY end_date DESC, created_at DESC, id DESC
      LIMIT 1
    )
    SELECT
      SUM(video.video_views)::bigint AS video_views,
      SUM(video.product_impressions)::bigint AS product_impressions,
      SUM(video.product_clicks)::bigint AS product_clicks
    FROM tiktok_video_performance_snapshots video
    JOIN latest_export export_record ON export_record.id = video.export_id
    WHERE LOWER(COALESCE(
      video.raw_metrics->'list'->'creator'->>'user_name',
      video.raw_metrics->'list'->>'username',
      ''
    )) = LOWER(:username)
  `, {
    replacements: { shopId, username, periodDays },
    type: QueryTypes.SELECT,
  });
  return rows[0] || null;
};

const findShopWithAuthorization = (shopId) => TikTokShop.findByPk(shopId, {
  include: [{ association: 'authorization' }],
});

const findCachedShopVideos = ({ shopId, username }) => {
  if (!ShopVideo?.findAll) return [];
  return ShopVideo.findAll({
    where: {
      shop_id: shopId,
      creator_username: { [Op.iLike]: username },
    },
    include: [{
      model: ShopVideoPerformanceSnapshot,
      as: 'performance_snapshots',
      required: false,
    }],
    order: [['posted_at', 'DESC']],
  });
};

module.exports = {
  bookingInclude,
  create,
  deleteById,
  findById,
  findByIdWithRelations,
  findBookings,
  findCachedShopVideos,
  findCreatorPerformance,
  findCreatorPerformanceSnapshots,
  findCreatorVideoMetrics,
  findForProductPerformance,
  findKoc,
  findKocs,
  findPartnerAuthorization,
  findSellerShop,
  findShopWithAuthorization,
  findStaffById,
  findTargetCollaborations,
  findUserById,
  findVideoPerformanceExports,
  findVideoPerformanceSnapshots,
  createKoc,
  createPartnerAuthorization,
  destroyPartnerAuthorizations,
  query,
  updateInstance,
  updatePartnerAuthorizations,
  updateById,
};
