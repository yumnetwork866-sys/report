export const topNavItems = [
  {
    to: '/shop/analytics',
    label: 'TikTok',
    permission: ['shop.analytics.view', 'shop.videos.library.view', 'shop.videos.performance.view', 'shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view', 'shop.orders.view', 'shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view'],
    alternatePermission: ['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view', 'channels.manage'],
    fallbackTo: '/channels/overview',
  },
  { to: '/manage/users', label: 'Admin', permission: ['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage', 'admin.shops.manage', 'admin.schedules.manage', 'admin.queues.view'] },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      {
        id: 'tiktok-shop',
        labelKey: 'navigation.tiktokShop',
        icon: 'shop',
        permission: ['shop.analytics.view', 'shop.videos.library.view', 'shop.videos.performance.view', 'shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view', 'shop.orders.view', 'shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view'],
        children: [
          { to: '/shop/analytics', labelKey: 'navigation.shopAnalytics', permission: 'shop.analytics.view' },
          { to: '/shop/videos', labelKey: 'navigation.videos', permission: ['shop.videos.library.view', 'shop.videos.performance.view'] },
           { to: '/shop/affiliate', labelKey: 'navigation.affiliate', permission: ['shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view'] },
           { to: '/shop/orders', labelKey: 'navigation.orders', permission: 'shop.orders.view' },
           { to: '/shop/bookings', labelKey: 'navigation.bookings', permission: ['shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view'] },
         ],
      },
      {
        id: 'tiktok-channel',
        labelKey: 'navigation.tiktokChannel',
        icon: 'channels',
        permission: ['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view', 'channels.manage'],
        children: [
          { to: '/channels/overview', labelKey: 'navigation.channelOverview', permission: 'channels.dashboard.view' },
          { to: '/channels/reports', labelKey: 'navigation.reports', permission: ['channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view'] },
          { to: '/channels/manage', labelKey: 'navigation.channels', permission: 'channels.manage' },
        ],
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/manage/users', labelKey: 'navigation.users', permission: ['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage'] },
      { to: '/manage/shops', labelKey: 'navigation.manageShops', permission: 'admin.shops.manage' },
      { to: '/manage/schedules', labelKey: 'navigation.schedule', permission: 'admin.schedules.manage' },
      { to: '/manage/queues', labelKey: 'navigation.queues', permission: 'admin.queues.view' },
    ],
  },
];

export const protectedRouteCards = [
  {
    path: '/channels/overview',
    component: 'Dashboard',
    permission: 'channels.dashboard.view',
    props: {
      heroTitle: 'Content performance dashboard',
      heroSubtitle: '',
    },
  },
  {
    path: '/channels/reports',
    component: 'ChannelReport',
    permission: ['channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view'],
    props: {},
  },
  {
    path: '/manage/users',
    component: 'EmployeeTable',
    permission: ['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage'],
    props: {
      heroTitle: '',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/schedules',
    component: 'ScheduleManagement',
    permission: 'admin.schedules.manage',
    props: {
      heroTitle: 'Schedule management',
      heroSubtitle: 'Manage automated data synchronization jobs.',
    },
  },
  {
    path: '/manage/queues',
    component: 'QueueManagement',
    permission: 'admin.queues.view',
    props: {},
  },
  {
    path: '/manage/shops',
    component: 'ShopAnalytics',
    permission: 'admin.shops.manage',
    props: { managementOnly: true },
  },
  {
    path: '/shop/affiliate',
    component: 'SellerAffiliatePanel',
    permission: ['shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view'],
    props: {},
  },
  {
    path: '/manage/koc-performance',
    component: 'KOCPerformance',
    permission: 'shop.affiliate.performance.view',
    props: {
      heroTitle: 'KOC performance',
      heroSubtitle: '',
    },
  },
  {
    path: '/shop/analytics',
    component: 'ShopAnalytics',
    permission: 'shop.analytics.view',
    props: { heroTitle: 'Shop analytics' },
  },
  {
    path: '/shop/videos',
    component: 'ShopAnalytics',
    permission: ['shop.videos.library.view', 'shop.videos.performance.view'],
    props: { videoOnly: true, combinedVideoTabs: true },
  },
  {
    path: '/shop/bookings',
    component: 'BookingManagement',
    permission: ['shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view'],
    props: {
      heroTitle: 'Booking',
      heroSubtitle: '',
    },
  },
  {
    path: '/shop/orders',
    component: 'OrderManagement',
    permission: 'shop.orders.view',
    props: {},
  },
  {
    path: '/channels/manage',
    component: 'ChannelManagement',
    permission: 'channels.manage',
    props: {
      heroTitle: 'Channel management',
      heroSubtitle: '',
    },
  },
];

export const redirectRoutes = [
  { path: '/manage', to: '/manage/users' },
  { path: '/manage/koc', to: '/manage/koc-performance' },
  { path: '/manage/shop-analytics', to: '/shop/analytics' },
  { path: '/videos', to: '/shop/videos' },
  { path: '/manage/video-analytics', to: '/shop/videos?view=performance' },
  { path: '/manage/affiliate', to: '/shop/affiliate' },
  { path: '/orders', to: '/shop/orders' },
  { path: '/bookings', to: '/shop/bookings' },
  { path: '/dashboard', to: '/channels/overview' },
  { path: '/channel-reports', to: '/channels/reports' },
  { path: '/manage/channels', to: '/channels/manage' },
];
