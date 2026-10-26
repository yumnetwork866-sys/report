const { TikTokApp } = require('../models');
const { encryptPartnerToken, decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

let appCache = null;
let candidateSecretsCache = [];

const normalizeAppKey = (appType = 'partner', region = 'MY') => {
  const normType = String(appType || 'partner').trim().toLowerCase();
  const normRegion = String(region || 'MY').trim().toUpperCase();
  return `${normType}:${normRegion}`;
};

const mapLegacyAppType = (rawType = 'partner', rawRegion = '') => {
  const type = String(rawType || 'partner').trim().toLowerCase();
  const region = String(rawRegion || '').trim().toUpperCase();

  if (type === 'partner_vn' || (type === 'partner' && region === 'VN')) {
    return { appType: 'partner', region: 'VN' };
  }
  if (type === 'partner_us' || (type === 'partner' && region === 'US')) {
    return { appType: 'partner', region: 'US' };
  }
  if (type === 'custom') {
    return { appType: 'custom', region: region || 'VN' };
  }
  return { appType: 'partner', region: region || 'MY' };
};

const refreshAppCache = async () => {
  try {
    const apps = await TikTokApp.findAll({ where: { is_active: true } });
    const newCache = new Map();
    const secrets = [];

    for (const app of apps) {
      const data = app.get ? app.get({ plain: true }) : app;
      let decryptedSecret = '';
      try {
        decryptedSecret = decryptPartnerToken(data.app_secret_encrypted);
      } catch (err) {
        // Log decryption failure but do not crash
        console.error(`[TikTokApp] Failed to decrypt secret for app ${data.id} (${data.name}):`, err.message);
      }

      if (decryptedSecret) {
        secrets.push(decryptedSecret);
      }

      const key = normalizeAppKey(data.app_type, data.region);
      newCache.set(key, {
        id: data.id,
        name: data.name,
        appType: data.app_type,
        region: String(data.region).toUpperCase(),
        appKey: data.app_key,
        appSecret: decryptedSecret,
        serviceId: data.service_id || data.app_key,
        authorizeUrl: data.authorize_url || 'https://services.tiktokshop.com/open/authorize',
        redirectUri: data.redirect_uri || '',
        isActive: data.is_active,
      });
    }

    appCache = newCache;
    candidateSecretsCache = secrets;
    return newCache;
  } catch (error) {
    console.error('[TikTokApp] Failed to load TikTok apps from DB:', error.message);
    if (!appCache) appCache = new Map();
    return appCache;
  }
};

const getAppCredentials = (rawType = 'partner', rawRegion = '') => {
  if (!appCache) {
    // If cache not yet loaded, return null to fall back to .env
    return null;
  }
  const { appType, region } = mapLegacyAppType(rawType, rawRegion);
  const key = normalizeAppKey(appType, region);
  const exact = appCache.get(key);
  if (exact) return exact;

  // Fallback to AUTO or ALL if exact match not found
  const autoApp = appCache.get(normalizeAppKey(appType, 'AUTO'));
  if (autoApp) return autoApp;

  const allApp = appCache.get(normalizeAppKey(appType, 'ALL'));
  if (allApp) return allApp;

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

    // 1. Auto-update region if app is AUTO or differs and no conflict exists
    if (normDetectedRegion && normDetectedRegion !== app.region && app.region !== 'ALL') {
      const conflict = await TikTokApp.findOne({
        where: { app_type: app.app_type, region: normDetectedRegion },
      });
      if (!conflict || conflict.id === app.id) {
        updates.region = normDetectedRegion;
      }
    }

    // 2. Auto-detect app_type based on scopes if needed
    if (Array.isArray(detectedScopes) && detectedScopes.length) {
      const hasOrderScope = detectedScopes.some((s) => s.startsWith('seller.order.') || s.startsWith('seller.finance.'));
      const hasAffiliateScope = detectedScopes.some((s) => s.startsWith('seller.affiliate_') || s.startsWith('data.shop_analytics'));
      if (hasOrderScope && !hasAffiliateScope && app.app_type !== 'custom') {
        const conflict = await TikTokApp.findOne({
          where: { app_type: 'custom', region: updates.region || app.region },
        });
        if (!conflict || conflict.id === app.id) {
          updates.app_type = 'custom';
        }
      } else if (hasAffiliateScope && app.app_type !== 'partner') {
        const conflict = await TikTokApp.findOne({
          where: { app_type: 'partner', region: updates.region || app.region },
        });
        if (!conflict || conflict.id === app.id) {
          updates.app_type = 'partner';
        }
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
