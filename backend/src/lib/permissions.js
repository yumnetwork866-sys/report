const PERMISSION_GROUPS = [
  {
    key: 'shop',
    permissions: [
      'shop.analytics.view',
      'shop.videos.library.view',
      'shop.videos.performance.view',
      'shop.affiliate.open.view',
      'shop.affiliate.target.view',
      'shop.affiliate.discovery.view',
      'shop.affiliate.performance.view',
      'shop.affiliate.creators.view',
      'shop.orders.view',
      'shop.bookings.video.view',
      'shop.bookings.product_performance.view',
      'shop.bookings.by_product.view',
      'shop.bookings.manage',
      'shop.affiliate.invite',
      'shop.affiliate.message',
      'admin.shops.manage',
    ],
  },
  {
    key: 'channels',
    permissions: [
      'channels.dashboard.view',
      'channels.reports.video.view',
      'channels.reports.revenue.view',
      'channels.reports.statistics.view',
      'channels.manage',
    ],
  },
  {
    key: 'admin',
    permissions: [
      'admin.users.view',
      'admin.users.manage',
      'admin.roles.manage',
      'admin.teams.manage',
      'admin.schedules.manage',
      'admin.queues.view',
      'app.manage',
    ],
  },
];

const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.permissions);

const ALL_PERMISSIONS = [...PERMISSIONS];

const DEFAULT_PERMISSIONS = PERMISSION_GROUPS
  .find((group) => group.key === 'channels').permissions.filter((permission) => permission.endsWith('.view'));

const LEGACY_PERMISSION_MAP = {
  reports: PERMISSION_GROUPS.find((group) => group.key === 'channels').permissions,
  tiktok: PERMISSION_GROUPS.find((group) => group.key === 'shop').permissions,
  users: ['admin.users.view', 'admin.users.manage', 'admin.roles.manage', 'admin.teams.manage'],
};

const expandLegacyPermissions = (value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((permission) => LEGACY_PERMISSION_MAP[permission] || [permission]);
};

const normalizePermissions = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(expandLegacyPermissions(value).filter((permission) => PERMISSIONS.includes(permission)))];
};

module.exports = {
  PERMISSION_GROUPS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  LEGACY_PERMISSION_MAP,
  expandLegacyPermissions,
  normalizePermissions,
};
