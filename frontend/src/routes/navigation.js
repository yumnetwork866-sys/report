export const topNavItems = [
  {
    to: '/shop/analytics',
    label: 'TikTok',
    permission: 'tiktok',
    alternatePermission: 'reports',
    fallbackTo: '/channels/overview',
  },
  { to: '/manage/users', label: 'Admin', permission: 'users' },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      {
        id: 'tiktok-shop',
        labelKey: 'navigation.tiktokShop',
        icon: 'shop',
        permission: 'tiktok',
        children: [
          { to: '/shop/analytics', labelKey: 'navigation.shopAnalytics', permission: 'tiktok' },
          { to: '/shop/videos', labelKey: 'navigation.videos', permission: 'tiktok' },
           { to: '/shop/affiliate', labelKey: 'navigation.affiliate', permission: 'tiktok' },
           { to: '/shop/orders', labelKey: 'navigation.orders', permission: 'tiktok' },
           { to: '/shop/bookings', labelKey: 'navigation.bookings', permission: 'tiktok' },
         ],
      },
      {
        id: 'tiktok-channel',
        labelKey: 'navigation.tiktokChannel',
        icon: 'channels',
        permission: 'reports',
        children: [
          { to: '/channels/overview', labelKey: 'navigation.channelOverview', permission: 'reports' },
          { to: '/channels/reports', labelKey: 'navigation.reports', permission: 'reports' },
          { to: '/channels/manage', labelKey: 'navigation.channels', permission: 'reports' },
        ],
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/manage/users', labelKey: 'navigation.users', permission: 'users' },
      { to: '/manage/shops', labelKey: 'navigation.manageShops', permission: 'tiktok' },
      { to: '/manage/schedules', labelKey: 'navigation.schedule', permission: 'admin' },
      { to: '/manage/queues', labelKey: 'navigation.queues', permission: 'admin' },
    ],
  },
];

export const protectedRouteCards = [
  {
    path: '/channels/overview',
    component: 'Dashboard',
    permission: 'reports',
    props: {
      heroTitle: 'Content performance dashboard',
      heroSubtitle: '',
    },
  },
  {
    path: '/channels/reports',
    component: 'ChannelReport',
    permission: 'reports',
    props: {},
  },
  {
    path: '/manage/users',
    component: 'EmployeeTable',
    permission: 'users',
    props: {
      heroTitle: 'User management',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/schedules',
    component: 'ScheduleManagement',
    permission: 'admin',
    props: {
      heroTitle: 'Schedule management',
      heroSubtitle: 'Manage automated data synchronization jobs.',
    },
  },
  {
    path: '/manage/queues',
    component: 'QueueManagement',
    permission: 'admin',
    props: {},
  },
  {
    path: '/manage/shops',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { managementOnly: true },
  },
  {
    path: '/shop/affiliate',
    component: 'SellerAffiliatePanel',
    permission: 'tiktok',
    props: {},
  },
  {
    path: '/manage/koc-performance',
    component: 'KOCPerformance',
    permission: 'tiktok',
    props: {
      heroTitle: 'KOC performance',
      heroSubtitle: '',
    },
  },
  {
    path: '/shop/analytics',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { heroTitle: 'Shop analytics' },
  },
  {
    path: '/shop/videos',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { videoOnly: true, combinedVideoTabs: true },
  },
  {
    path: '/shop/bookings',
    component: 'BookingManagement',
    permission: 'tiktok',
    props: {
      heroTitle: 'Booking',
      heroSubtitle: '',
    },
  },
  {
    path: '/shop/orders',
    component: 'SellerAffiliatePanel',
    permission: 'tiktok',
    props: { initialSection: 'orders', ordersOnly: true },
  },
  {
    path: '/channels/manage',
    component: 'ChannelManagement',
    permission: 'reports',
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
