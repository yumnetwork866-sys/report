export const PERMISSION_GROUPS = [
  {
    key: 'shop', labelKey: 'rolePermissions.shop', items: [
      { key: 'analytics', labelKey: 'rolePermissions.analytics', permissions: [{ key: 'shop.analytics.view', labelKey: 'rolePermissions.view' }] },
      { key: 'videos', labelKey: 'rolePermissions.videos', permissions: [
        { key: 'shop.videos.library.view', labelKey: 'rolePermissions.videoLibrary' },
        { key: 'shop.videos.performance.view', labelKey: 'rolePermissions.videoPerformance' },
      ] },
      { key: 'affiliate', labelKey: 'rolePermissions.affiliate', permissions: [
        { key: 'shop.affiliate.open.view', labelKey: 'rolePermissions.affiliateOpen' },
        { key: 'shop.affiliate.target.view', labelKey: 'rolePermissions.affiliateTarget' },
        { key: 'shop.affiliate.discovery.view', labelKey: 'rolePermissions.affiliateDiscovery' },
        { key: 'shop.affiliate.performance.view', labelKey: 'rolePermissions.affiliatePerformance' },
        { key: 'shop.affiliate.creators.view', labelKey: 'rolePermissions.affiliateCreators' },
        { key: 'shop.affiliate.invite', labelKey: 'rolePermissions.inviteCreator' },
        { key: 'shop.affiliate.message', labelKey: 'rolePermissions.messageCreator' },
      ] },
      { key: 'orders', labelKey: 'rolePermissions.orders', permissions: [{ key: 'shop.orders.view', labelKey: 'rolePermissions.view' }] },
      { key: 'bookings', labelKey: 'rolePermissions.bookings', permissions: [
        { key: 'shop.bookings.video.view', labelKey: 'rolePermissions.bookingVideo' },
        { key: 'shop.bookings.product_performance.view', labelKey: 'rolePermissions.bookingProductPerformance' },
        { key: 'shop.bookings.by_product.view', labelKey: 'rolePermissions.bookingByProduct' },
        { key: 'shop.bookings.manage', labelKey: 'rolePermissions.manage' },
      ] },
      { key: 'manage-shops', labelKey: 'rolePermissions.manageShops', permissions: [{ key: 'admin.shops.manage', labelKey: 'rolePermissions.manage' }] },
    ],
  },
  {
    key: 'channels', labelKey: 'rolePermissions.channels', items: [
      { key: 'dashboard', labelKey: 'rolePermissions.dashboard', permissions: [{ key: 'channels.dashboard.view', labelKey: 'rolePermissions.view' }] },
      { key: 'reports', labelKey: 'rolePermissions.reports', permissions: [
        { key: 'channels.reports.video.view', labelKey: 'rolePermissions.reportVideo' },
        { key: 'channels.reports.revenue.view', labelKey: 'rolePermissions.reportRevenue' },
        { key: 'channels.reports.statistics.view', labelKey: 'rolePermissions.reportStatistics' },
      ] },
      { key: 'manage-channels', labelKey: 'rolePermissions.manageChannels', permissions: [{ key: 'channels.manage', labelKey: 'rolePermissions.manage' }] },
    ],
  },
  {
    key: 'admin', labelKey: 'rolePermissions.administration', items: [
      { key: 'users', labelKey: 'rolePermissions.users', permissions: [{ key: 'admin.users.manage', labelKey: 'rolePermissions.manage' }] },
      { key: 'roles', labelKey: 'rolePermissions.roles', permissions: [{ key: 'admin.roles.manage', labelKey: 'rolePermissions.manage' }] },
      { key: 'teams', labelKey: 'rolePermissions.teams', permissions: [{ key: 'admin.teams.manage', labelKey: 'rolePermissions.manage' }] },
      { key: 'schedules', labelKey: 'rolePermissions.schedules', permissions: [{ key: 'admin.schedules.manage', labelKey: 'rolePermissions.manage' }] },
      { key: 'queues', labelKey: 'rolePermissions.queues', permissions: [{ key: 'admin.queues.view', labelKey: 'rolePermissions.view' }] },
    ],
  },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.flatMap((item) => item.permissions));
export const ALL_PERMISSIONS = PERMISSIONS.map((permission) => permission.key);
export const DEFAULT_PERMISSIONS = ['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view'];
export const LEGACY_PERMISSION_MAP = {
  reports: PERMISSION_GROUPS.find((group) => group.key === 'channels').items.flatMap((item) => item.permissions.map(({ key }) => key)),
  tiktok: PERMISSION_GROUPS.find((group) => group.key === 'shop').items.flatMap((item) => item.permissions.map(({ key }) => key)),
  users: ['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage'],
};

export const expandLegacyPermissions = (permissions) => (
  [...new Set((Array.isArray(permissions) ? permissions : []).flatMap((permission) => LEGACY_PERMISSION_MAP[permission] || [permission]))]
);

export const permissionLabelKey = (key) => PERMISSIONS.find((permission) => permission.key === key)?.labelKey || null;
