/**
 * Service to resolve which App / Authorization a Shop and a Job should use.
 * Handles multi-app setups per region where scopes are divided across apps.
 */

const SELLER_ORDER_SCOPE = 'seller.order.info';
const SELLER_ANALYTICS_SCOPE = 'data.shop_analytics.public.read';
const SELLER_COMPASS_SCOPE = 'seller.compass.read';
const SELLER_AFFILIATE_SCOPE = 'seller.affiliate_collaboration.read';
const SELLER_CREATOR_MARKETPLACE_SCOPE = 'seller.creator_marketplace.read';
const SELLER_PRODUCT_BASIC_SCOPE = 'seller.product.basic';
const SELLER_FINANCE_SCOPE = 'seller.finance.read';

/**
 * Equivalent scopes mapping.
 * Some TikTok regions / Partner configurations bundle permissions under affiliate collaboration
 * rather than exposing a separate compass scope for offline export tasks.
 */
const EQUIVALENT_SCOPES = {
  [SELLER_COMPASS_SCOPE]: [SELLER_COMPASS_SCOPE, SELLER_AFFILIATE_SCOPE],
};

const SYSTEM_CORE_SCOPES = [
  {
    scope: SELLER_ORDER_SCOPE,
    label: 'Đồng bộ Đơn hàng (Orders)',
    category: 'orders',
    description: 'Lấy đơn hàng, đối soát GMV và trạng thái giao hàng',
    jobs: ['tiktok_affiliate_orders', 'tiktok_channel_report_revenue'],
  },
  {
    scope: SELLER_COMPASS_SCOPE,
    label: 'Báo cáo Compass & KOC',
    category: 'compass',
    description: 'Xuất dữ liệu hiệu suất KOC, Compass và video bán hàng',
    jobs: ['tiktok_creator_performance'],
  },
  {
    scope: SELLER_ANALYTICS_SCOPE,
    label: 'Phân tích & Video Shop',
    category: 'analytics',
    description: 'Chỉ số tổng thể Shop và dữ liệu video performance',
    jobs: [
      'tiktok_shop_analytics',
      'tiktok_shop_video_catalog',
      'booking_video_performance',
      'tiktok_affiliate_video_performance',
      'tiktok_booking_video_detail',
    ],
  },
  {
    scope: SELLER_AFFILIATE_SCOPE,
    label: 'Chiến dịch Affiliate & KOC',
    category: 'affiliate',
    description: 'Quản lý Affiliate và lời mời hợp tác Creator',
    jobs: [],
  },
  {
    scope: SELLER_CREATOR_MARKETPLACE_SCOPE,
    label: 'Creator Marketplace',
    category: 'marketplace',
    description: 'Tìm kiếm hồ sơ KOC và mời hợp tác trực tiếp',
    jobs: [],
  },
];

const JOB_SCOPE_MAPPINGS = {
  tiktok_creator_performance: {
    capability: 'compass',
    requiredScope: SELLER_COMPASS_SCOPE,
    secondaryScope: SELLER_AFFILIATE_SCOPE,
  },
  tiktok_shop_analytics: {
    capability: 'analytics',
    requiredScope: SELLER_ANALYTICS_SCOPE,
  },
  tiktok_affiliate_orders: {
    capability: 'orders',
    requiredScope: SELLER_ORDER_SCOPE,
  },
  tiktok_channel_report_revenue: {
    capability: 'orders',
    requiredScope: SELLER_ORDER_SCOPE,
  },
  booking_video_performance: {
    capability: 'analytics',
    requiredScope: SELLER_ANALYTICS_SCOPE,
  },
  tiktok_shop_video_catalog: {
    capability: 'analytics',
    requiredScope: SELLER_ANALYTICS_SCOPE,
  },
  tiktok_affiliate_video_performance: {
    capability: 'analytics',
    requiredScope: SELLER_ANALYTICS_SCOPE,
  },
  tiktok_booking_video_detail: {
    capability: 'analytics',
    requiredScope: SELLER_ANALYTICS_SCOPE,
  },
};

const getGrantedScopes = (authorization) => {
  if (!authorization) return [];
  const raw = authorization.granted_scopes;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const isAuthExpired = (authorization) => {
  if (!authorization?.refresh_token_expires_at) return false;
  return new Date(authorization.refresh_token_expires_at).getTime() <= Date.now();
};

/**
 * Resolves the best TikTokShopAuthorization for a specific Shop and required scope/capability.
 * @param {object} shop TikTokShop instance (with authorization & orderAuthorization included)
 * @param {object} options { requiredScope, capability, jobKey }
 * @returns {object|null} The resolved TikTokShopAuthorization
 */
const resolveShopAuthorization = (shop, options = {}) => {
  if (!shop) return null;

  let { requiredScope, capability } = options;
  if (!requiredScope && !capability && options.jobKey && JOB_SCOPE_MAPPINGS[options.jobKey]) {
    const jobConfig = JOB_SCOPE_MAPPINGS[options.jobKey];
    requiredScope = jobConfig.requiredScope;
    capability = jobConfig.capability;
  }

  const candidates = [shop.authorization, shop.orderAuthorization].filter(Boolean);
  if (!candidates.length) return null;

  // 1. Direct match by required scope (or equivalent scopes) in granted_scopes
  if (requiredScope) {
    const candidateScopes = EQUIVALENT_SCOPES[requiredScope] || [requiredScope];
    const exactMatch = candidates.find((auth) => {
      const scopes = getGrantedScopes(auth);
      return candidateScopes.some((s) => scopes.includes(s)) && !isAuthExpired(auth);
    });
    if (exactMatch) return exactMatch;
  }

  // 2. Secondary scope match if specified by job
  if (options.jobKey && JOB_SCOPE_MAPPINGS[options.jobKey]?.secondaryScope) {
    const secScope = JOB_SCOPE_MAPPINGS[options.jobKey].secondaryScope;
    const secMatch = candidates.find((auth) => {
      const scopes = getGrantedScopes(auth);
      return scopes.includes(secScope) && !isAuthExpired(auth);
    });
    if (secMatch) return secMatch;
  }

  // 3. Match by App Capability or App Type
  if (capability === 'orders') {
    if (shop.orderAuthorization && !isAuthExpired(shop.orderAuthorization)) {
      return shop.orderAuthorization;
    }
  }

  if (['compass', 'analytics', 'affiliate'].includes(capability)) {
    if (shop.authorization && !isAuthExpired(shop.authorization)) {
      return shop.authorization;
    }
  }

  // 4. Match by App capabilities array if populated
  if (capability) {
    const capMatch = candidates.find((auth) => {
      const appCaps = auth.app?.capabilities || [];
      return Array.isArray(appCaps) && appCaps.includes(capability) && !isAuthExpired(auth);
    });
    if (capMatch) return capMatch;
  }

  // 5. Fallback: prefer orderAuthorization for order capability, else authorization, else first active candidate
  if (capability === 'orders' && shop.orderAuthorization) {
    return shop.orderAuthorization;
  }
  return shop.authorization || candidates[0];
};

/**
 * Returns an overview of capability status for a shop across its authorizations.
 * Useful for the UI to display which app powers each capability.
 */
const getShopCapabilitiesStatus = (shop) => {
  if (!shop) return {};

  const authList = [
    shop.authorization ? { role: 'primary', auth: shop.authorization } : null,
    shop.orderAuthorization ? { role: 'orders', auth: shop.orderAuthorization } : null,
  ].filter(Boolean);

  const capabilities = {
    orders: {
      key: 'orders',
      name: 'Đơn hàng (OMS)',
      connected: false,
      appId: null,
      appName: null,
      appKey: null,
      appType: null,
      expired: false,
      hasRequiredScope: false,
      requiredScope: SELLER_ORDER_SCOPE,
    },
    analytics: {
      key: 'analytics',
      name: 'Phân tích (Analytics)',
      connected: false,
      appId: null,
      appName: null,
      appKey: null,
      appType: null,
      expired: false,
      hasRequiredScope: false,
      requiredScope: SELLER_ANALYTICS_SCOPE,
    },
    compass: {
      key: 'compass',
      name: 'Compass & Creator',
      connected: false,
      appId: null,
      appName: null,
      appKey: null,
      appType: null,
      expired: false,
      hasRequiredScope: false,
      requiredScope: SELLER_COMPASS_SCOPE,
    },
    affiliate: {
      key: 'affiliate',
      name: 'KOC & Affiliate',
      connected: false,
      appId: null,
      appName: null,
      appKey: null,
      appType: null,
      expired: false,
      hasRequiredScope: false,
      requiredScope: SELLER_AFFILIATE_SCOPE,
    },
  };

  for (const { auth } of authList) {
    const scopes = getGrantedScopes(auth);
    const expired = isAuthExpired(auth);
    const app = auth.app || {};
    const appCaps = Array.isArray(app.capabilities) ? app.capabilities : [];

    // Check Orders
    const hasOrderScope = scopes.includes(SELLER_ORDER_SCOPE) || scopes.some((s) => s.includes('order'));
    if (hasOrderScope || appCaps.includes('orders') || auth.app_type === 'custom') {
      capabilities.orders = {
        key: 'orders',
        name: 'Đơn hàng (OMS)',
        connected: true,
        authId: auth.id,
        appId: app.id || auth.app_id || null,
        appName: app.name || (auth.app_type === 'custom' ? 'Custom OMS App' : 'TikTok Partner'),
        appKey: app.app_key || null,
        appType: auth.app_type,
        expired,
        hasRequiredScope: scopes.includes(SELLER_ORDER_SCOPE),
        requiredScope: SELLER_ORDER_SCOPE,
      };
    }

    // Check Analytics
    const hasAnalyticsScope = scopes.includes(SELLER_ANALYTICS_SCOPE) || scopes.some((s) => s.includes('analytics'));
    if (hasAnalyticsScope || appCaps.includes('analytics') || auth.app_type === 'partner') {
      capabilities.analytics = {
        key: 'analytics',
        name: 'Phân tích (Analytics)',
        connected: true,
        authId: auth.id,
        appId: app.id || auth.app_id || null,
        appName: app.name || 'TikTok Partner App',
        appKey: app.app_key || null,
        appType: auth.app_type,
        expired,
        hasRequiredScope: scopes.includes(SELLER_ANALYTICS_SCOPE),
        requiredScope: SELLER_ANALYTICS_SCOPE,
      };
    }

    // Check Compass
    const hasCompassScope = scopes.includes(SELLER_COMPASS_SCOPE)
      || scopes.includes(SELLER_AFFILIATE_SCOPE)
      || scopes.some((s) => s.includes('compass'));
    if (hasCompassScope || appCaps.includes('compass')) {
      capabilities.compass = {
        key: 'compass',
        name: 'Compass & Creator',
        connected: true,
        authId: auth.id,
        appId: app.id || auth.app_id || null,
        appName: app.name || 'TikTok Partner App',
        appKey: app.app_key || null,
        appType: auth.app_type,
        expired,
        hasRequiredScope: hasCompassScope,
        requiredScope: SELLER_COMPASS_SCOPE,
      };
    }

    // Check Affiliate
    const hasAffiliateScope = scopes.includes(SELLER_AFFILIATE_SCOPE) || scopes.some((s) => s.includes('affiliate'));
    if (hasAffiliateScope || appCaps.includes('affiliate')) {
      capabilities.affiliate = {
        key: 'affiliate',
        name: 'KOC & Affiliate',
        connected: true,
        authId: auth.id,
        appId: app.id || auth.app_id || null,
        appName: app.name || 'TikTok Partner App',
        appKey: app.app_key || null,
        appType: auth.app_type,
        expired,
        hasRequiredScope: scopes.includes(SELLER_AFFILIATE_SCOPE),
        requiredScope: SELLER_AFFILIATE_SCOPE,
      };
    }
  }

  return capabilities;
};

/**
 * Detailed Scope Audit for a Shop across all its linked App Authorizations.
 * Reports:
 * - granted_scopes: Scopes actively granted with providing App info
 * - missing_scopes: System core scopes not granted or expired, with affected jobs
 * - suggested_apps: Apps in this shop's region that can provide missing scopes
 * - is_fully_authorized: boolean
 */
const getShopScopeAudit = (shop, availableApps = []) => {
  if (!shop) {
    return {
      granted_scopes: [],
      missing_scopes: [],
      extra_scopes: [],
      is_fully_authorized: false,
    };
  }

  const shopRegion = String(shop.region || '').trim().toUpperCase();
  const authCandidates = [shop.authorization, shop.orderAuthorization].filter(Boolean);

  const grantedScopeMap = new Map();

  for (const auth of authCandidates) {
    const scopes = getGrantedScopes(auth);
    const expired = isAuthExpired(auth);
    const app = auth.app || {};

    for (const scope of scopes) {
      const existing = grantedScopeMap.get(scope);
      if (!existing || (existing.expired && !expired)) {
        grantedScopeMap.set(scope, {
          scope,
          authId: auth.id,
          appId: app.id || auth.app_id || null,
          appName: app.name || (auth.app_type === 'custom' ? 'Custom OMS App' : 'TikTok Partner'),
          appRegion: app.region || shopRegion || null,
          appKey: app.app_key || null,
          expired,
        });
      }
    }
  }

  const granted = [];
  const missing = [];

  for (const core of SYSTEM_CORE_SCOPES) {
    const candidateScopes = EQUIVALENT_SCOPES[core.scope] || [core.scope];
    let provider = null;

    // Check non-expired provider first
    for (const s of candidateScopes) {
      const p = grantedScopeMap.get(s);
      if (p && !p.expired) {
        provider = p;
        break;
      }
    }
    // If not found, check if there is an expired provider
    if (!provider) {
      for (const s of candidateScopes) {
        const p = grantedScopeMap.get(s);
        if (p) {
          provider = p;
          break;
        }
      }
    }

    if (provider && !provider.expired) {
      granted.push({
        ...core,
        status: 'GRANTED',
        provider,
      });
    } else {
      const candidates = availableApps.filter((app) => {
        if (!app.is_active) return false;
        const normRegion = String(app.region || '').toUpperCase();
        const regionMatch = normRegion === shopRegion || normRegion === 'ALL' || normRegion === 'AUTO';
        if (!regionMatch) return false;

        const declared = Array.isArray(app.declared_scopes) ? app.declared_scopes : [];
        if (candidateScopes.some((s) => declared.includes(s))) return true;

        const caps = Array.isArray(app.capabilities) ? app.capabilities : [];
        if (core.category === 'orders' && (caps.includes('orders') || app.name?.toLowerCase().includes('order') || app.name?.toLowerCase().includes('oms'))) return true;
        if (core.category === 'compass' && (caps.includes('compass') || caps.includes('affiliate'))) return true;
        if (core.category === 'analytics' && (caps.includes('analytics') || app.app_type === 'partner')) return true;
        if (core.category === 'affiliate' && caps.includes('affiliate')) return true;

        return false;
      }).map((app) => ({
        id: app.id,
        name: app.name,
        appKey: app.app_key,
        region: app.region,
        appType: app.app_type,
      }));

      missing.push({
        ...core,
        status: provider?.expired ? 'EXPIRED' : 'MISSING',
        affectedJobs: core.jobs,
        expiredProvider: provider?.expired ? provider : null,
        suggestedApps: candidates,
      });
    }
  }

  const extra = [];
  for (const [scope, provider] of grantedScopeMap.entries()) {
    if (!SYSTEM_CORE_SCOPES.some((c) => c.scope === scope)) {
      extra.push({ scope, provider });
    }
  }

  return {
    shopId: shop.id,
    shopName: shop.name,
    region: shopRegion,
    granted_scopes: granted,
    missing_scopes: missing,
    extra_scopes: extra,
    is_fully_authorized: missing.length === 0,
    total_granted: granted.length,
    total_missing: missing.length,
  };
};

module.exports = {
  SELLER_ORDER_SCOPE,
  SELLER_ANALYTICS_SCOPE,
  SELLER_COMPASS_SCOPE,
  SELLER_AFFILIATE_SCOPE,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
  SELLER_PRODUCT_BASIC_SCOPE,
  SELLER_FINANCE_SCOPE,
  SYSTEM_CORE_SCOPES,
  JOB_SCOPE_MAPPINGS,
  getGrantedScopes,
  isAuthExpired,
  resolveShopAuthorization,
  getShopCapabilitiesStatus,
  getShopScopeAudit,
};

