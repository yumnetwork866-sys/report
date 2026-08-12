export const topNavItems = [
  {
    to: '/manage/shop-analytics',
    label: 'TikTok',
    permission: 'tiktok',
    alternatePermission: 'reports',
    fallbackTo: '/dashboard',
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
          { to: '/manage/shop-analytics', labelKey: 'navigation.shopAnalytics', permission: 'tiktok' },
          { to: '/videos', labelKey: 'navigation.videos', permission: 'tiktok' },
           { to: '/manage/video-analytics', labelKey: 'navigation.videoAnalytics', permission: 'tiktok' },
           { to: '/manage/affiliate', labelKey: 'navigation.affiliate', permission: 'tiktok' },
           { to: '/manage/creator-chat', labelKey: 'navigation.creatorChat', permission: 'tiktok' },
           { to: '/orders', labelKey: 'navigation.orders', permission: 'tiktok' },
           { to: '/bookings', labelKey: 'navigation.bookings', permission: 'tiktok' },
         ],
      },
      {
        id: 'tiktok-channel',
        labelKey: 'navigation.tiktokChannel',
        icon: 'channels',
        permission: 'reports',
        children: [
          { to: '/dashboard', labelKey: 'navigation.channelOverview', permission: 'reports' },
          { to: '/channel-reports', labelKey: 'navigation.reports', permission: 'reports' },
          { to: '/manage/channels', labelKey: 'navigation.channels', permission: 'reports' },
        ],
      },
    ],
  },
  {
    title: 'Facebook',
    items: [
      { to: '/chatbot/dashboard', labelKey: 'navigation.dashboard', permission: 'chatbots' },
      { to: '/chatbot/chat', labelKey: 'navigation.chat', permission: 'chatbots' },
      { to: '/chatbot/orders', labelKey: 'navigation.orders', permission: 'chatbots' },
    ],
  },

  {
    title: 'Admin',
    items: [
      { to: '/manage/users', labelKey: 'navigation.users', permission: 'users' },
      { to: '/manage/shops', labelKey: 'navigation.manageShops', permission: 'tiktok' },
      { to: '/manage/schedules', labelKey: 'navigation.schedule', permission: 'admin' },
      { to: '/chatbot/chat-setting', labelKey: 'navigation.chatSettings', permission: 'chatbots' },
    ],
  },
];

export const protectedRouteCards = [
  {
    path: '/dashboard',
    component: 'Dashboard',
    permission: 'reports',
    props: {
      heroTitle: 'Content performance dashboard',
      heroSubtitle: '',
    },
  },
  {
    path: '/channel-reports',
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
    path: '/manage/shops',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { managementOnly: true },
  },
  {
    path: '/manage/affiliate',
    component: 'SellerAffiliatePanel',
    permission: 'tiktok',
    props: {},
  },
  {
    path: '/manage/creator-chat',
    component: 'CreatorChatPage',
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
    path: '/manage/shop-analytics',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { heroTitle: 'Shop analytics' },
  },
  {
    path: '/videos',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { videoOnly: true, videoExportOnly: true },
  },
  {
    path: '/manage/video-analytics',
    component: 'ShopAnalytics',
    permission: 'tiktok',
    props: { videoOnly: true },
  },
  {
    path: '/bookings',
    component: 'BookingManagement',
    permission: 'tiktok',
    props: {
      heroTitle: 'Booking management',
      heroSubtitle: '',
    },
  },
  {
    path: '/orders',
    component: 'SellerAffiliatePanel',
    permission: 'tiktok',
    props: { initialSection: 'orders', ordersOnly: true },
  },
  {
    path: '/manage/channels',
    component: 'ChannelManagement',
    permission: 'reports',
    props: {
      heroTitle: 'Channel management',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/dashboard',
    component: 'ChatbotManagement',
    permission: 'chatbots',
    props: {
      heroTitle: 'Facebook',
      heroSubtitle: '',
    },
  },

  {
    path: '/chatbot/chat',
    component: 'ChatbotManagement',
    permission: 'chatbots',
    props: {
      heroTitle: 'Chat',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/chat-setting',
    component: 'ChatbotManagement',
    permission: 'chatbots',
    props: {
      heroTitle: 'Chat setting',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/orders',
    component: 'ChatbotManagement',
    permission: 'chatbots',
    props: {
      heroTitle: 'Orders',
      heroSubtitle: '',
    },
  },
];

export const redirectRoutes = [
  { path: '/manage', to: '/manage/users' },
  { path: '/manage/koc', to: '/manage/koc-performance' },
  { path: '/chatbot', to: '/chatbot/dashboard' },
  { path: '/chatbot/rag', to: '/chatbot/chat-setting' },
];
