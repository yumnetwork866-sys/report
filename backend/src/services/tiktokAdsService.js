const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');
const { monitoredFetch } = require('./scheduledRunMonitorService');
const { getMyrExchangeRates } = require('./exchangeRateService');

const getBusinessConfig = async (db = sequelize) => {
  try {
    const rows = await db.query(`
      SELECT app_key, app_secret_encrypted, redirect_uri
      FROM tiktok_apps
      WHERE app_type = 'ads' AND is_active = true
      ORDER BY id DESC LIMIT 1
    `, { type: QueryTypes.SELECT });

    if (rows && rows[0]?.app_key) {
      let secret = '';
      try {
        secret = decryptPartnerToken(rows[0].app_secret_encrypted);
      } catch {}
      return {
        appId: rows[0].app_key,
        secret: secret || process.env.TIKTOK_BUSINESS_SECRET || '01ed165188d088f5fcf477d3b699cd90a1f45365',
        redirectUri: rows[0].redirect_uri || process.env.TIKTOK_BUSINESS_REDIRECT_URI || 'https://report-api.yumnetwork.vn/api/ads/oauth/callback',
        baseUrl: process.env.TIKTOK_BUSINESS_API_BASE_URL || 'https://business-api.tiktok.com',
      };
    }
  } catch {}

  return {
    appId: process.env.TIKTOK_BUSINESS_APP_ID || '7709534514481283092',
    secret: process.env.TIKTOK_BUSINESS_SECRET || '01ed165188d088f5fcf477d3b699cd90a1f45365',
    redirectUri: process.env.TIKTOK_BUSINESS_REDIRECT_URI || 'https://report-api.yumnetwork.vn/api/ads/oauth/callback',
    baseUrl: process.env.TIKTOK_BUSINESS_API_BASE_URL || 'https://business-api.tiktok.com',
  };
};

const createTikTokAdsService = ({ db = sequelize, fetchImpl = fetch, getExchangeRates = null } = {}) => {
  const safeFetch = (input, options) => monitoredFetch(input, options, fetchImpl);
  const fetchExchangeRates = getExchangeRates || (() => getMyrExchangeRates(fetchImpl));
  const select = (sql, replacements = {}) => db.query(sql, { type: QueryTypes.SELECT, replacements });
  let syncPromise = null;
  const lastSyncByShop = new Map();

  return {
    async getAuthUrl(state = '') {
      const { appId, redirectUri } = await getBusinessConfig(db);
      const params = new URLSearchParams({
        app_id: appId,
        state: state || 'tiktok_ads_auth',
        redirect_uri: redirectUri,
      });
      return `https://business-api.tiktok.com/portal/auth?${params.toString()}`;
    },

    async handleOAuthCallback(code) {
      const { appId, secret, baseUrl } = await getBusinessConfig(db);
      if (!code) throw new Error('Authorization code is required.');

      const response = await safeFetch(`${baseUrl}/open_api/v1.3/oauth2/access_token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          secret,
          auth_code: code,
        }),
      });

      const payload = await response.json();
      if (payload.code !== 0) {
        throw new Error(payload.message || `TikTok Ads API error: ${payload.code}`);
      }

      let { access_token, advertiser_ids = [], scope = '' } = payload.data || {};
      if (!access_token) {
        throw new Error('Access token was not returned by TikTok Ads API.');
      }

      let advertiserDetails = [];
      if (Array.isArray(advertiser_ids) && advertiser_ids.length) {
        advertiserDetails = advertiser_ids.map((id) => ({ id: String(id), name: null }));
      } else {
        try {
          const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
          advUrl.searchParams.set('app_id', appId);
          advUrl.searchParams.set('secret', secret);
          const advRes = await safeFetch(advUrl.toString(), {
            method: 'GET',
            headers: {
              'Access-Token': access_token,
              'Content-Type': 'application/json',
            },
          });
          const advData = await advRes.json();
          if (advData?.code === 0 && Array.isArray(advData?.data?.list)) {
            advertiser_ids = advData.data.list.map((a) => String(a.advertiser_id || a.advertiserId || a)).filter(Boolean);
            advertiserDetails = advData.data.list.map((a) => ({
              id: String(a.advertiser_id || a.advertiserId || ''),
              name: a.advertiser_name || a.name || null,
            })).filter((a) => Boolean(a.id));
          }
        } catch (advErr) {
          console.warn('[TikTok Ads] Could not fetch advertiser list in callback:', advErr.message);
        }
      }

      await db.query(`
        INSERT INTO tiktok_ads_authorizations (app_id, access_token, advertiser_ids, advertiser_details, scope, updated_at)
        VALUES (:appId, :accessToken, :advertiserIds::jsonb, :advertiserDetails::jsonb, :scope, NOW())
      `, {
        replacements: {
          appId,
          accessToken: access_token,
          advertiserIds: JSON.stringify(advertiser_ids),
          advertiserDetails: JSON.stringify(advertiserDetails),
          scope: String(scope || ''),
        },
      });

      return {
        accessToken: access_token,
        advertiserIds: advertiser_ids,
      };
    },

    async getStatus() {
      const rows = await select(`
        SELECT id, app_id, access_token, advertiser_ids, scope, updated_at
        FROM tiktok_ads_authorizations
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      if (!rows.length) {
        return { connected: false, advertisers: [] };
      }
      const auth = rows[0];
      let advertiserIds = Array.isArray(auth.advertiser_ids)
        ? auth.advertiser_ids
        : (typeof auth.advertiser_ids === 'string' ? JSON.parse(auth.advertiser_ids || '[]') : []);

      if (!advertiserIds.length && auth.access_token) {
        try {
          const { appId, secret, baseUrl } = await getBusinessConfig(db);
          const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
          advUrl.searchParams.set('app_id', appId);
          advUrl.searchParams.set('secret', secret);
          const advRes = await safeFetch(advUrl.toString(), {
            method: 'GET',
            headers: {
              'Access-Token': auth.access_token,
              'Content-Type': 'application/json',
            },
          });
          const advData = await advRes.json();
          if (advData?.code === 0 && Array.isArray(advData?.data?.list)) {
            advertiserIds = advData.data.list.map((a) => String(a.advertiser_id || a.advertiserId || a)).filter(Boolean);
            if (advertiserIds.length) {
              await db.query(`
                UPDATE tiktok_ads_authorizations
                SET advertiser_ids = :advertiserIds::jsonb, updated_at = NOW()
                WHERE id = :id
              `, { replacements: { advertiserIds: JSON.stringify(advertiserIds), id: auth.id } });
            }
          }
        } catch {}
      }

      return {
        connected: true,
        appId: auth.app_id,
        advertisers: advertiserIds,
        updatedAt: auth.updated_at,
      };
    },

    async getAuthorizations({ fetchDetails = true } = {}) {
      const rows = await select(`
        SELECT id, app_id, access_token, advertiser_ids, advertiser_details, scope, created_at, updated_at
        FROM tiktok_ads_authorizations
        ORDER BY updated_at DESC
      `);
      if (!rows.length) {
        return { authorizations: [], totalAdvertisers: 0 };
      }

      const { appId, secret, baseUrl } = await getBusinessConfig(db);
      const authorizations = [];
      let totalAdvertisers = 0;

      for (const row of rows) {
        let rawIds = Array.isArray(row.advertiser_ids)
          ? row.advertiser_ids
          : (typeof row.advertiser_ids === 'string' ? JSON.parse(row.advertiser_ids || '[]') : []);

        let rawDetails = Array.isArray(row.advertiser_details)
          ? row.advertiser_details
          : (typeof row.advertiser_details === 'string' ? JSON.parse(row.advertiser_details || '[]') : []);

        const advMap = new Map();
        rawDetails.forEach((d) => {
          if (d && d.id) {
            advMap.set(String(d.id), { id: String(d.id), name: d.name || null });
          }
        });
        rawIds.forEach((id) => {
          const key = String(id);
          if (!advMap.has(key)) {
            advMap.set(key, { id: key, name: null });
          }
        });

        const hasMissingNames = Array.from(advMap.values()).some((a) => !a.name);
        if (fetchDetails && hasMissingNames && row.access_token && appId && secret) {
          try {
            const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
            advUrl.searchParams.set('app_id', appId);
            advUrl.searchParams.set('secret', secret);
            const advRes = await safeFetch(advUrl.toString(), {
              method: 'GET',
              headers: {
                'Access-Token': row.access_token,
                'Content-Type': 'application/json',
              },
            });
            const advData = await advRes.json();
            if (advData?.code === 0 && Array.isArray(advData?.data?.list)) {
              for (const a of advData.data.list) {
                const aId = String(a.advertiser_id || a.advertiserId || '');
                if (aId) {
                  advMap.set(aId, {
                    id: aId,
                    name: a.advertiser_name || a.name || null,
                  });
                }
              }
              const currentIds = Array.from(advMap.keys());
              const currentDetails = Array.from(advMap.values());
              await db.query(`
                UPDATE tiktok_ads_authorizations
                SET advertiser_ids = :currentIds::jsonb, advertiser_details = :currentDetails::jsonb, updated_at = NOW()
                WHERE id = :id
              `, {
                replacements: {
                  currentIds: JSON.stringify(currentIds),
                  currentDetails: JSON.stringify(currentDetails),
                  id: row.id,
                },
              });
            }
          } catch (err) {
            console.warn(`[TikTok Ads] Failed to fetch advertiser details for auth ${row.id}:`, err?.message);
          }
        }

        const advertisers = Array.from(advMap.values());
        totalAdvertisers += advertisers.length;

        authorizations.push({
          id: row.id,
          appId: row.app_id,
          scope: row.scope,
          advertiserCount: advertisers.length,
          advertisers,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }

      return { authorizations, totalAdvertisers };
    },

    async deleteAuthorization(id) {
      const numericId = Number(id);
      if (!numericId) throw new Error('Authorization ID is required.');
      await db.query(`DELETE FROM tiktok_ads_authorizations WHERE id = :id`, {
        replacements: { id: numericId },
      });
      return { success: true };
    },

    async removeAdvertiser(authId, advertiserId) {
      const numericId = Number(authId);
      const advId = String(advertiserId || '').trim();
      if (!numericId || !advId) throw new Error('Authorization ID and Advertiser ID are required.');
      const rows = await select(`SELECT id, advertiser_ids, advertiser_details FROM tiktok_ads_authorizations WHERE id = :id`, { id: numericId });
      if (!rows.length) throw new Error('Authorization not found.');
      let ids = Array.isArray(rows[0].advertiser_ids) ? rows[0].advertiser_ids : JSON.parse(rows[0].advertiser_ids || '[]');
      ids = ids.filter((i) => String(i) !== advId);
      let details = Array.isArray(rows[0].advertiser_details) ? rows[0].advertiser_details : JSON.parse(rows[0].advertiser_details || '[]');
      details = details.filter((d) => String(d?.id || d) !== advId);
      await db.query(`
        UPDATE tiktok_ads_authorizations
        SET advertiser_ids = :ids::jsonb, advertiser_details = :details::jsonb, updated_at = NOW()
        WHERE id = :id
      `, { replacements: { ids: JSON.stringify(ids), details: JSON.stringify(details), id: numericId } });
      return { success: true, remaining: ids.length };
    },

    async syncAuthorization(authId) {
      const numericId = Number(authId);
      if (!numericId) throw new Error('Authorization ID is required.');
      const rows = await select(`SELECT id, app_id, access_token, advertiser_ids FROM tiktok_ads_authorizations WHERE id = :id`, { id: numericId });
      if (!rows.length) throw new Error('Authorization not found.');
      const { appId, secret, baseUrl } = await getBusinessConfig(db);
      const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
      advUrl.searchParams.set('app_id', appId);
      advUrl.searchParams.set('secret', secret);
      const advRes = await safeFetch(advUrl.toString(), {
        method: 'GET',
        headers: {
          'Access-Token': rows[0].access_token,
          'Content-Type': 'application/json',
        },
      });
      const advData = await advRes.json();
      if (advData?.code !== 0) throw new Error(advData?.message || 'TikTok API error');
      const list = Array.isArray(advData?.data?.list) ? advData.data.list : [];
      const ids = list.map((a) => String(a.advertiser_id || a.advertiserId || '')).filter(Boolean);
      const details = list.map((a) => ({
        id: String(a.advertiser_id || a.advertiserId || ''),
        name: a.advertiser_name || a.name || null,
      })).filter((a) => Boolean(a.id));
      await db.query(`
        UPDATE tiktok_ads_authorizations
        SET advertiser_ids = :ids::jsonb, advertiser_details = :details::jsonb, updated_at = NOW()
        WHERE id = :id
      `, { replacements: { ids: JSON.stringify(ids), details: JSON.stringify(details), id: numericId } });
      return {
        id: numericId,
        advertisers: details,
      };
    },

    async getLiveSessionAds(shopId = null, { sync = false, sessionIds = [], sessions = [] } = {}) {
      if (sync) {
        try {
          await this.syncLiveSessionAds({ shopId, sessionIds, sessions });
        } catch (err) {
          console.warn('[TikTok Ads] Auto-sync live session ads failed:', err.message);
        }
      }

      return select(`
        SELECT shop_id, session_id, ads_cost, currency, source, advertiser_id, updated_at
        FROM live_session_ads
        WHERE (:shopId::int IS NULL OR shop_id = :shopId)
      `, { shopId: shopId ? Number(shopId) : null });
    },

    async syncLiveSessionAds({ shopId = null, sessionIds = [], sessions = [], force = false } = {}) {
      if (syncPromise) {
        return syncPromise;
      }
      const cacheKey = shopId ? Number(shopId) : 'all';
      const lastSyncAt = lastSyncByShop.get(cacheKey) || 0;
      if (!force && Date.now() - lastSyncAt < 60 * 1000) {
        return select(`
          SELECT shop_id, session_id, ads_cost, currency, source, advertiser_id, updated_at
          FROM live_session_ads
          WHERE (:shopId::int IS NULL OR shop_id = :shopId)
        `, { shopId: shopId ? Number(shopId) : null });
      }

      const runSync = async () => {
        const authRows = await select(`
          SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations ORDER BY updated_at DESC
        `);
        if (!authRows.length) return [];

      const { appId, secret, baseUrl } = await getBusinessConfig(db);
      const authList = [];

      for (const authRow of authRows) {
        const { access_token: accessToken, advertiser_ids: rawAdvertisers } = authRow;
        let advertiserIds = Array.isArray(rawAdvertisers)
          ? rawAdvertisers
          : (typeof rawAdvertisers === 'string' ? JSON.parse(rawAdvertisers || '[]') : []);

        // Resolve advertiser IDs if empty
        if (!advertiserIds.length && appId && secret) {
          const versions = ['v1.3', 'v2.0'];
          for (const ver of versions) {
            try {
              const advUrl = new URL(`${baseUrl}/open_api/${ver}/oauth2/advertiser/get/`);
              advUrl.searchParams.set('app_id', appId);
              advUrl.searchParams.set('secret', secret);
              const advRes = await safeFetch(advUrl.toString(), {
                method: 'GET',
                headers: {
                  'Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
              });
              const advData = await advRes.json();
              if (advData?.code === 0 && Array.isArray(advData?.data?.list)) {
                advertiserIds = advData.data.list.map((a) => String(a.advertiser_id || a.advertiserId || a)).filter(Boolean);
                if (advertiserIds.length) {
                  await db.query(`
                    UPDATE tiktok_ads_authorizations
                    SET advertiser_ids = :advertiserIds::jsonb, updated_at = NOW()
                    WHERE access_token = :accessToken
                  `, {
                    replacements: {
                      advertiserIds: JSON.stringify(advertiserIds),
                      accessToken,
                    },
                  });
                  break;
                }
              }
            } catch (advErr) {
              console.warn(`[TikTok Ads Sync] Could not fetch advertiser list on ${ver}:`, advErr.message);
            }
          }
        }

        if (advertiserIds.length) {
          authList.push({ accessToken, advertiserIds });
        }
      }

      if (!authList.length) {
        console.warn('[TikTok Ads Sync] No active authorizations or advertiser IDs available for sync.');
        return [];
      }

      let allShops = [];
      try {
        allShops = await select(`
          SELECT id, name, platform_shop_id, region
          FROM tiktok_shops
          WHERE platform_shop_id IS NOT NULL
        `);
      } catch {
        allShops = [];
      }

      if (!allShops.length) return [];
      const allShopsByPlatformId = new Map(allShops.map((s) => [String(s.platform_shop_id), s]));
      const targetShops = shopId
        ? allShops.filter((s) => Number(s.id) === Number(shopId))
        : allShops;

      if (!targetShops.length) return [];

      const results = [];
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const endDate = formatDate(now);
      const thirtyDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const startDate = formatDate(thirtyDaysAgo);

      // Map sessions from database orders and performances for accurate shop attribution
      const dbLiveSessions = await select(`
        SELECT DISTINCT s.shop_id, s.content_id AS session_id
        FROM tiktok_affiliate_order_skus s
        WHERE s.content_type = 'LIVE' AND s.content_id IS NOT NULL
      `);

      let dbPerformances = [];
      try {
        dbPerformances = await select(`
          SELECT DISTINCT shop_id, session_id
          FROM live_session_performances
          WHERE session_id IS NOT NULL
        `);
      } catch {
        dbPerformances = [];
      }

      const sessionToShopMap = new Map();
      dbLiveSessions.forEach((r) => sessionToShopMap.set(String(r.session_id), Number(r.shop_id)));
      dbPerformances.forEach((r) => sessionToShopMap.set(String(r.session_id), Number(r.shop_id)));

      if (Array.isArray(sessions)) {
        sessions.forEach((s) => {
          const sid = s.session_id || s.sessionId || s.live_id || s.id;
          const spId = s.shop_id || s.shopId || (targetShops[0]?.id || 1);
          if (sid && spId) {
            sessionToShopMap.set(String(sid), Number(spId));
          }
        });
      }

      let cachedExchangeRates = null;
      const convertCurrencyAmount = async (amount, fromCurrency, toCurrency) => {
        if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
        if (!cachedExchangeRates) {
          try {
            const payload = await fetchExchangeRates();
            cachedExchangeRates = payload?.rates || null;
          } catch {
            cachedExchangeRates = null;
          }
        }
        const fromRate = Number(cachedExchangeRates?.[fromCurrency]);
        const toRate = Number(cachedExchangeRates?.[toCurrency]);
        if (Number.isFinite(fromRate) && fromRate > 0 && Number.isFinite(toRate) && toRate > 0) {
          return (amount * fromRate) / toRate;
        }
        return amount;
      };

      const sessionSpendAccumulator = new Map();
      const recordedCampaignRooms = new Set();
      const recordSpend = async (sId, spId, amount, currency, rawMeta = {}, advId = null, campId = null) => {
        if (!sId || !Number.isFinite(amount) || amount <= 0) return;
        const resolvedShopId = sessionToShopMap.get(String(sId)) || spId;
        if (shopId && Number(resolvedShopId) !== Number(shopId)) {
          return;
        }
        if (campId) {
          const campKey = `${resolvedShopId}:${sId}:${campId}`;
          if (recordedCampaignRooms.has(campKey)) return;
          recordedCampaignRooms.add(campKey);
        }
        const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
        const key = `${resolvedShopId}:${sId}`;
        const existing = sessionSpendAccumulator.get(key);
        if (!existing) {
          sessionSpendAccumulator.set(key, {
            sessionId: String(sId),
            shopId: resolvedShopId,
            cost: amount,
            currency: normalizedCurrency,
            advertiserId: advId,
            rawMeta: { ...rawMeta, cost: amount, currency: normalizedCurrency },
          });
          return;
        }
        const convertedAmount = await convertCurrencyAmount(amount, normalizedCurrency, existing.currency);
        existing.cost += convertedAmount;
        existing.advertiserId = existing.advertiserId || advId;
        existing.rawMeta = { ...existing.rawMeta, ...rawMeta, cost: existing.cost, currency: existing.currency };
        sessionSpendAccumulator.set(key, existing);
      };

      for (const { accessToken, advertiserIds } of authList) {
        for (const advertiserId of advertiserIds) {
          // 1. Get stores associated with this advertiser
          let rawStores = [];
          try {
            const storeUrl = new URL(`${baseUrl}/open_api/v1.3/gmv_max/store/list/`);
            storeUrl.searchParams.set('advertiser_id', advertiserId);
            const storeRes = await safeFetch(storeUrl.toString(), {
              method: 'GET',
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            });
            const storeData = await storeRes.json();
            if (storeData?.code === 0) {
              rawStores = Array.isArray(storeData?.data?.store_list)
                ? storeData.data.store_list
                : (Array.isArray(storeData?.data?.list) ? storeData.data.list : []);
            }
          } catch (storeErr) {
            console.warn(`[TikTok Ads Sync] gmv_max/store/list failed: ${storeErr.message}`);
          }

          // Match stores with all system shops (deduplicating by store_id so stores shared across multiple BCs run once)
          const seenStoreIds = new Set();
          let matchedStores = rawStores.filter((st) => {
            const sId = String(st.store_id || st.id || '');
            if (!sId || seenStoreIds.has(sId)) return false;
            if (allShopsByPlatformId.has(sId)) {
              seenStoreIds.add(sId);
              return true;
            }
            return false;
          });

          // If store/list returns empty, only allow single-shop fallback when sessions are explicitly provided for that shop
          if (!matchedStores.length && !rawStores.length && shopId && targetShops.length === 1 && Array.isArray(sessions) && sessions.length > 0) {
            matchedStores = [{ store_id: targetShops[0].platform_shop_id }];
          }

          // If advertiser has stores but none match target shops, skip to prevent cross-shop attribution
          if (!matchedStores.length) {
            continue;
          }

          for (const store of matchedStores) {
            const storePlatformId = String(store.store_id || store.id || '');
            const targetShop = allShopsByPlatformId.get(storePlatformId) || targetShops[0];
            const defaultCurrency = targetShop.region === 'VN' ? 'VND' : 'MYR';

            // 2. Fetch all LIVE_GMV_MAX campaigns for this specific store with full pagination
            let liveCampaignIds = [];
            try {
              let page = 1;
              while (page <= 50) {
                const campUrl = new URL(`${baseUrl}/open_api/v1.3/gmv_max/campaign/get/`);
                campUrl.searchParams.set('advertiser_id', advertiserId);
                campUrl.searchParams.set('store_id', storePlatformId);
                campUrl.searchParams.set('filtering', JSON.stringify({ gmv_max_promotion_types: ['LIVE_GMV_MAX'] }));
                campUrl.searchParams.set('page_size', '100');
                campUrl.searchParams.set('page', String(page));

                const campRes = await safeFetch(campUrl.toString(), {
                  method: 'GET',
                  headers: {
                    'Access-Token': accessToken,
                    'Content-Type': 'application/json',
                  },
                });
                const campData = await campRes.json();
                const list = campData?.data?.list;
                if (!Array.isArray(list) || list.length === 0) break;
                for (const c of list) {
                  if (c?.campaign_id) liveCampaignIds.push(String(c.campaign_id));
                }
                const totalPages = campData?.data?.page_info?.total_page || 1;
                if (page >= totalPages) break;
                page += 1;
              }
            } catch (campErr) {
              console.warn(`[TikTok Ads Sync] gmv_max/campaign/get failed for store ${storePlatformId}:`, campErr.message);
            }

            // 3. Query GMV Max report at room_id level with campaign_ids and full pagination
            const campBatches = liveCampaignIds.length > 0
              ? Array.from({ length: Math.ceil(liveCampaignIds.length / 50) }, (_, i) => liveCampaignIds.slice(i * 50, (i + 1) * 50))
              : [null];

            for (const batch of campBatches) {
              try {
                let reportPage = 1;
                while (reportPage <= 50) {
                  const url = new URL(`${baseUrl}/open_api/v1.3/gmv_max/report/get/`);
                  url.searchParams.set('advertiser_id', advertiserId);
                  url.searchParams.set('store_ids', JSON.stringify([storePlatformId]));
                  url.searchParams.set('dimensions', JSON.stringify(['campaign_id', 'room_id']));
                  url.searchParams.set('metrics', JSON.stringify(['cost', 'gross_revenue', 'orders']));
                  if (batch && batch.length > 0) {
                    url.searchParams.set('filtering', JSON.stringify({ campaign_ids: batch }));
                  }
                  url.searchParams.set('start_date', startDate);
                  url.searchParams.set('end_date', endDate);
                  url.searchParams.set('page_size', '100');
                  url.searchParams.set('page', String(reportPage));

                  const res = await safeFetch(url.toString(), {
                    method: 'GET',
                    headers: {
                      'Access-Token': accessToken,
                      'Content-Type': 'application/json',
                    },
                  });
                  const payload = await res.json();
                  const list = payload?.data?.list;
                  if (payload?.code === 0 && Array.isArray(list) && list.length > 0) {
                    for (const item of list) {
                      const roomId = String(item.dimensions?.room_id || '').trim();
                      const cost = Number(item.metrics?.cost ?? item.metrics?.net_cost ?? 0);
                      const currency = String(item.metrics?.currency || defaultCurrency).trim().toUpperCase();
                      if (roomId && Number.isFinite(cost) && cost > 0) {
                        const actualShopId = sessionToShopMap.get(roomId) || targetShop.id;
                        const campId = String(item.dimensions?.campaign_id || '');
                        await recordSpend(roomId, actualShopId, cost, currency, item.metrics, advertiserId, campId);
                      }
                    }
                  }
                  const totalReportPages = payload?.data?.page_info?.total_page || 1;
                  if (reportPage >= totalReportPages || !Array.isArray(list) || list.length === 0) break;
                  reportPage += 1;
                }
              } catch (gmvErr) {
                console.warn(`[TikTok Ads Sync] GMV Max room report failed:`, gmvErr.message);
              }
            }
          }
        }
      }

      // Clean up previous API-synced ads for target shop(s) that had freshly synced rows
      const syncedShopIds = new Set(Array.from(sessionSpendAccumulator.values()).map((item) => Number(item.shopId)));
      const shopsToClean = shopId ? [Number(shopId)] : Array.from(syncedShopIds);
      for (const sId of shopsToClean) {
        const currentSessionIds = Array.from(sessionSpendAccumulator.values())
          .filter((item) => Number(item.shopId) === sId)
          .map((item) => String(item.sessionId));

        if (currentSessionIds.length > 0) {
          await db.query(`
            DELETE FROM live_session_ads
            WHERE shop_id = :shopId AND source = 'api' AND session_id NOT IN (:sessionIds)
          `, { replacements: { shopId: sId, sessionIds: currentSessionIds } });
        }
      }

      for (const item of sessionSpendAccumulator.values()) {
        await db.query(`
          INSERT INTO live_session_ads (shop_id, session_id, ads_cost, currency, source, advertiser_id, raw_data, updated_at)
          VALUES (
            :shopId,
            :sessionId,
            :adsCost,
            :currency,
            'api',
            :advertiserId,
            :rawData::jsonb,
            NOW()
          )
          ON CONFLICT (shop_id, session_id) DO UPDATE
          SET ads_cost = EXCLUDED.ads_cost,
              currency = EXCLUDED.currency,
              source = 'api',
              advertiser_id = EXCLUDED.advertiser_id,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW()
          WHERE live_session_ads.source != 'manual' OR live_session_ads.ads_cost IS NULL
        `, {
          replacements: {
            shopId: item.shopId,
            sessionId: String(item.sessionId),
            adsCost: Number(item.cost),
            currency: item.currency || 'USD',
            advertiserId: item.advertiserId,
            rawData: JSON.stringify(item.rawMeta || {}),
          },
        });
        results.push({
          shop_id: item.shopId,
          session_id: String(item.sessionId),
          ads_cost: Number(item.cost),
          currency: item.currency || 'USD',
        });
      }

      return results;
    };

    syncPromise = runSync().finally(() => {
      lastSyncByShop.set(cacheKey, Date.now());
      syncPromise = null;
    });
    return syncPromise;
  },

    async saveLiveSessionAds({ shopId, sessionId, adsCost, currency = 'MYR', source = 'manual', advertiserId = null }) {
      const numericShopId = Number(shopId);
      if (!numericShopId || !sessionId) {
        throw new Error('Shop ID and Session ID are required.');
      }

      if (adsCost === null || adsCost === undefined || adsCost === '') {
        await db.query(`
          DELETE FROM live_session_ads
          WHERE shop_id = :shopId AND session_id = :sessionId
        `, { replacements: { shopId: numericShopId, sessionId } });
        return { ads_cost: null };
      }

      const costNum = Number(adsCost);
      if (!Number.isFinite(costNum) || costNum < 0) {
        throw new Error('Ads cost must be a non-negative number.');
      }

      await db.query(`
        INSERT INTO live_session_ads (shop_id, session_id, ads_cost, currency, source, advertiser_id, updated_at)
        VALUES (:shopId, :sessionId, :adsCost, :currency, :source, :advertiserId, NOW())
        ON CONFLICT (shop_id, session_id) DO UPDATE
        SET ads_cost = EXCLUDED.ads_cost,
            currency = EXCLUDED.currency,
            source = EXCLUDED.source,
            advertiser_id = COALESCE(EXCLUDED.advertiser_id, live_session_ads.advertiser_id),
            updated_at = NOW()
      `, {
        replacements: {
          shopId: numericShopId,
          sessionId,
          adsCost: costNum,
          currency: currency || 'MYR',
          source: source || 'manual',
          advertiserId: advertiserId || null,
        },
      });

      return {
        shop_id: numericShopId,
        session_id: sessionId,
        ads_cost: costNum,
        currency,
        source,
      };
    },

    async fetchAdsSpendForTimeRange({ advertiserId, startDate, endDate, signal }) {
      const authRows = await select(`
        SELECT access_token FROM tiktok_ads_authorizations ORDER BY updated_at DESC LIMIT 1
      `);
      if (!authRows.length) return null;
      const accessToken = authRows[0].access_token;
      const { baseUrl } = getBusinessConfig();

      const url = new URL(`${baseUrl}/open_api/v1.3/report/integrated/get/`);
      url.searchParams.set('advertiser_id', advertiserId);
      url.searchParams.set('service_type', 'AUCTION');
      url.searchParams.set('report_type', 'BASIC');
      url.searchParams.set('data_level', 'AUCTION_ADVERTISER');
      url.searchParams.set('dimensions', JSON.stringify(['stat_time_day']));
      url.searchParams.set('metrics', JSON.stringify(['spend', 'impressions', 'clicks']));
      url.searchParams.set('start_date', startDate);
      url.searchParams.set('end_date', endDate);

      const res = await safeFetch(url.toString(), {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        signal,
      });
      const data = await res.json();
      if (data.code !== 0) {
        throw new Error(data.message || `TikTok Ads Reporting Error: ${data.code}`);
      }
      return data.data?.list || [];
    },
  };
};

module.exports = {
  ...createTikTokAdsService(),
  createTikTokAdsService,
  getBusinessConfig,
};

