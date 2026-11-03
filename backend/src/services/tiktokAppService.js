const { TikTokApp } = require('../models');
const { decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

let appCache = null;
let candidateSecretsCache = [];
let allActiveAppsList = [];

const normalizeAppKey = (appType = 'partner', region = 'MY') => {
  const normType = String(appType || 'partner').trim().toLowerCase();
  const normRegion = String(region || 'MY').trim().toUpperCase();
  return `${normType}:${normRegion}`;
};

const mapLegacyAppType = (rawType = 'partner', rawRegion = '') => {
  const type = String(rawType || 'partner').trim().toLowerCase();
  const region = String(rawRegion || '').trim().toUpperCase();

  if (type === 'channel') {
    return { appType: 'channel', region: region || 'ALL' };
  }
  if (type === 'partner_vn' || (type === 'partner' && region === 'VN')) {
    return { appType: 'partner', region: 'VN' };
  }
  if (type === 'partner_us' || (type === 'partner' && region === 'US')) {
    return { appType: 'partner', region: 'US' };
  }
  if (type === 'custom') {
    return { appType: 'custom', region: region || 'MY' };
  }
  return { appType: 'partner', region: region || 'MY' };
};

const refreshAppCache = async () => {
  try {
    const apps = await TikTokApp.findAll({ where: { is_active: true } });
    const newCache = new Map();
    const secrets = [];
    const activeList = [];

    for (const app of apps) {
      const data = app.get ? app.get({ plain: true }) : app;
      let decryptedSecret = '';
      try {
        decryptedSecret = decryptPartnerToken(data.app_secret_encrypted);
      } catch (err) {
        console.error(`[TikTokApp] Failed to decrypt secret for app ${data.id} (${data.name}):`, err.message);
      }

      if (decryptedSecret) {
        secrets.push(decryptedSecret);
      }

      const entry = {
        id: data.id,
        name: data.name,
        appType: data.app_type,
        region: String(data.region).toUpperCase(),
        appKey: data.app_key,
        appSecret: decryptedSecret,
        serviceId: data.service_id || data.app_key,
        authorizeUrl: data.authorize_url || 'https://services.tiktokshop.com/open/authorize',
        redirectUri: data.redirect_uri || '',
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        declaredScopes: Array.isArray(data.declared_scopes) ? data.declared_scopes : [],
        isActive: data.is_active,
      };

      const key = normalizeAppKey(data.app_type, data.region);
      // If no default exists yet, or if this one is richer/newer, set as default for key
      if (!newCache.has(key)) {
        newCache.set(key, entry);
      }
      newCache.set(`id:${data.id}`, entry);
      newCache.set(`key:${data.app_key}`, entry);
      activeList.push(entry);
    }

    appCache = newCache;
    candidateSecretsCache = secrets;
    allActiveAppsList = activeList;
    return newCache;
  } catch (error) {
    console.error('[TikTokApp] Failed to load TikTok apps from DB:', error.message);
    if (!appCache) appCache = new Map();
    return appCache;
  }
};

const getAppCredentials = (rawType = 'partner', rawRegion = '', options = {}) => {
  if (!appCache) {
    return null;
  }
  const explicitAppId = (typeof rawType === 'object' && rawType !== null ? rawType.appId : null)
    || options?.appId;
  if (explicitAppId) {
    const byId = appCache.get(`id:${explicitAppId}`);
    if (byId) return byId;
  }

  const explicitAppKey = (typeof rawType === 'object' && rawType !== null ? rawType.appKey : null)
    || options?.appKey;
  if (explicitAppKey) {
    const byKey = appCache.get(`key:${explicitAppKey}`);
    if (byKey) return byKey;
  }

  const { appType, region } = mapLegacyAppType(rawType, rawRegion);
  const capability = options?.capability || (typeof rawType === 'object' ? rawType.capability : null);
  const requiredScope = options?.requiredScope || (typeof rawType === 'object' ? rawType.requiredScope : null);

  // If capability or requiredScope is specified, search active apps list for best match
  if (capability || requiredScope) {
    const candidates = allActiveAppsList.filter((app) => {
      const typeMatches = app.appType === appType || (appType === 'custom' && app.appType === 'partner');
      if (!typeMatches) return false;
      const regionMatches = app.region === region || app.region === 'AUTO' || app.region === 'ALL';
      return regionMatches;
    });

    if (candidates.length) {
      // Prioritize exact region + scope/capability match
      const scored = candidates.map((app) => {
        let score = 0;
        if (app.region === region) score += 10;
        else if (app.region === 'AUTO') score += 5;
        else if (app.region === 'ALL') score += 3;

        if (requiredScope && app.declaredScopes?.includes(requiredScope)) score += 20;
        if (capability && app.capabilities?.includes(capability)) score += 15;
        return { app, score };
      }).sort((a, b) => b.score - a.score);

      if (scored[0]?.app) return scored[0].app;
    }
  }

  const appTypes = appType === 'custom' ? ['custom', 'partner'] : [appType];

  for (const candidateType of appTypes) {
    const exact = appCache.get(normalizeAppKey(candidateType, region));
    if (exact) return exact;

    const autoApp = appCache.get(normalizeAppKey(candidateType, 'AUTO'));
    if (autoApp) return autoApp;

    const allApp = appCache.get(normalizeAppKey(candidateType, 'ALL'));
    if (allApp) return allApp;
  }

  return null;
};

const autoSyncAppFromConnection = async ({ appId, appKey, detectedRegion, detectedScopes }) => {
  try {
    const { TikTokApp } = require('../models');
    let app = null;
    if (appId) {
      app = await TikTokApp.findByPk(appId);
    }
    if (!app && appKey) {
      app = await TikTokApp.findOne({ where: { app_key: appKey } });
    }
    if (!app) return null;

    const updates = {};
    const normDetectedRegion = String(detectedRegion || '').trim().toUpperCase();

    // 1. Auto-update region if app is AUTO or differs
    if (normDetectedRegion && normDetectedRegion !== app.region && app.region !== 'ALL') {
      updates.region = normDetectedRegion;
    }

    // 2. Auto-record detected scopes and infer capabilities if present
    if (Array.isArray(detectedScopes) && detectedScopes.length > 0) {
      const currentScopes = Array.isArray(app.declared_scopes) ? app.declared_scopes : [];
      const mergedScopes = [...new Set([...currentScopes, ...detectedScopes])];
      if (mergedScopes.length !== currentScopes.length) {
        updates.declared_scopes = mergedScopes;
      }

      const currentCaps = Array.isArray(app.capabilities) ? app.capabilities : [];
      const nextCaps = [...currentCaps];
      if (detectedScopes.some((s) => s.includes('order')) && !nextCaps.includes('orders')) {
        nextCaps.push('orders');
      }
      if (detectedScopes.some((s) => s.includes('compass')) && !nextCaps.includes('compass')) {
        nextCaps.push('compass');
      }
      if (detectedScopes.some((s) => s.includes('affiliate')) && !nextCaps.includes('affiliate')) {
        nextCaps.push('affiliate');
      }
      if (detectedScopes.some((s) => s.includes('analytics')) && !nextCaps.includes('analytics')) {
        nextCaps.push('analytics');
      }
      if (nextCaps.length !== currentCaps.length) {
        updates.capabilities = nextCaps;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await app.update(updates);
      await refreshAppCache();
      console.log(`[TikTokApp] Auto-synced app "${app.name}":`, updates);
    }
    return app;
  } catch (err) {
    console.error('[TikTokApp] Error during autoSyncAppFromConnection:', err.message);
    return null;
  }
};

const getCandidateSecrets = () => {
  return candidateSecretsCache || [];
};

const invalidateAppCache = () => {
  return refreshAppCache();
};

module.exports = {
  normalizeAppKey,
  mapLegacyAppType,
  refreshAppCache,
  getAppCredentials,
  autoSyncAppFromConnection,
  getCandidateSecrets,
  invalidateAppCache,
};
