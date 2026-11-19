const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

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
      } catch (_e) {}
      return {
        appId: rows[0].app_key,
        secret: secret || process.env.TIKTOK_BUSINESS_SECRET || '01ed165188d088f5fcf477d3b699cd90a1f45365',
        redirectUri: rows[0].redirect_uri || process.env.TIKTOK_BUSINESS_REDIRECT_URI || 'https://report-api.yumnetwork.vn/api/ads/oauth/callback',
        baseUrl: process.env.TIKTOK_BUSINESS_API_BASE_URL || 'https://business-api.tiktok.com',
      };
    }
  } catch (_err) {}

  return {
    appId: process.env.TIKTOK_BUSINESS_APP_ID || '7709534514481283092',
    secret: process.env.TIKTOK_BUSINESS_SECRET || '01ed165188d088f5fcf477d3b699cd90a1f45365',
    redirectUri: process.env.TIKTOK_BUSINESS_REDIRECT_URI || 'https://report-api.yumnetwork.vn/api/ads/oauth/callback',
    baseUrl: process.env.TIKTOK_BUSINESS_API_BASE_URL || 'https://business-api.tiktok.com',
  };
};

const createTikTokAdsService = ({ db = sequelize, fetchImpl = fetch } = {}) => {
  const select = (sql, replacements = {}) => db.query(sql, { type: QueryTypes.SELECT, replacements });

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

      const response = await fetchImpl(`${baseUrl}/open_api/v1.3/oauth2/access_token/`, {
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

      if (!Array.isArray(advertiser_ids) || !advertiser_ids.length) {
        try {
          const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
          advUrl.searchParams.set('app_id', appId);
          advUrl.searchParams.set('secret', secret);
          const advRes = await fetchImpl(advUrl.toString(), {
            method: 'GET',
            headers: {
              'Access-Token': access_token,
              'Content-Type': 'application/json',
            },
          });
          const advData = await advRes.json();
          if (advData?.code === 0 && Array.isArray(advData?.data?.list)) {
            advertiser_ids = advData.data.list.map((a) => String(a.advertiser_id || a.advertiserId || a)).filter(Boolean);
          }
        } catch (advErr) {
          console.warn('[TikTok Ads] Could not fetch advertiser list in callback:', advErr.message);
        }
      }

      await db.query(`
        INSERT INTO tiktok_ads_authorizations (app_id, access_token, advertiser_ids, scope, updated_at)
        VALUES (:appId, :accessToken, :advertiserIds::jsonb, :scope, NOW())
      `, {
        replacements: {
          appId,
          accessToken: access_token,
          advertiserIds: JSON.stringify(advertiser_ids),
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
          const advRes = await fetchImpl(advUrl.toString(), {
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
        } catch (_advErr) {}
      }

      return {
        connected: true,
        appId: auth.app_id,
        advertisers: advertiserIds,
        updatedAt: auth.updated_at,
      };
    },

    async getLiveSessionAds(shopId = null, { sync = true, sessionIds = [] } = {}) {
      if (sync) {
        try {
          await this.syncLiveSessionAds({ shopId, sessionIds });
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

    async syncLiveSessionAds({ shopId = null, sessionIds = [] } = {}) {
      const authRows = await select(`
        SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations ORDER BY updated_at DESC LIMIT 1
      `);
      if (!authRows.length) return [];

      const { access_token: accessToken, advertiser_ids: rawAdvertisers } = authRows[0];
      let advertiserIds = Array.isArray(rawAdvertisers)
        ? rawAdvertisers
        : (typeof rawAdvertisers === 'string' ? JSON.parse(rawAdvertisers || '[]') : []);

      const { appId, secret, baseUrl } = await getBusinessConfig(db);

      if (!advertiserIds.length && appId && secret) {
        try {
          const advUrl = new URL(`${baseUrl}/open_api/v1.3/oauth2/advertiser/get/`);
          advUrl.searchParams.set('app_id', appId);
          advUrl.searchParams.set('secret', secret);
          const advRes = await fetchImpl(advUrl.toString(), {
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
            }
          }
        } catch (advErr) {
          console.warn('[TikTok Ads Sync] Could not fetch advertiser list:', advErr.message);
        }
      }

      if (!advertiserIds.length) {
        console.warn('[TikTok Ads Sync] No advertiser IDs available for sync.');
        return [];
      }

      let targetShops = [];
      if (shopId) {
        targetShops = await select(`
          SELECT id, name, platform_shop_id, region
          FROM tiktok_shops
          WHERE id = :shopId AND platform_shop_id IS NOT NULL
        `, { shopId: Number(shopId) });
      } else {
        targetShops = await select(`
          SELECT id, name, platform_shop_id, region
          FROM tiktok_shops
          WHERE platform_shop_id IS NOT NULL
        `);
      }

      const results = [];
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const endDate = formatDate(now);
      // TikTok GMV Max and Reporting API limits query range to at most 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const startDate = formatDate(thirtyDaysAgo);

      const findShopForSession = (storeId) => {
        if (targetShops.length === 1) return targetShops[0];
        if (storeId) {
          const match = targetShops.find((s) => String(s.platform_shop_id) === String(storeId));
          if (match) return match;
        }
        return targetShops[0] || { id: 1, region: 'MY' };
      };

      for (const advertiserId of advertiserIds) {
        // 1. Fetch authorized stores for this advertiser from GMV Max store list
        let storeIds = [];
        try {
          const storeUrl = new URL(`${baseUrl}/open_api/v1.3/gmv_max/store/list/`);
          storeUrl.searchParams.set('advertiser_id', advertiserId);
          const storeRes = await fetchImpl(storeUrl.toString(), {
            method: 'GET',
            headers: {
              'Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          });
          const storeData = await storeRes.json();
          if (storeData?.code === 0 && Array.isArray(storeData?.data?.list)) {
            storeIds = storeData.data.list.map((s) => String(s.store_id || s.storeId || '')).filter(Boolean);
          }
        } catch (_storeErr) {}

        if (!storeIds.length && targetShops.length) {
          storeIds = targetShops.map((s) => String(s.platform_shop_id)).filter(Boolean);
        }

        // 2. Query GMV Max report
        if (storeIds.length) {
          try {
            const url = new URL(`${baseUrl}/open_api/v1.3/gmv_max/report/get/`);
            url.searchParams.set('advertiser_id', advertiserId);
            url.searchParams.set('store_ids', JSON.stringify(storeIds));
            url.searchParams.set('dimensions', JSON.stringify(['room_id']));
            url.searchParams.set('metrics', JSON.stringify(['cost', 'gross_revenue', 'orders']));
            url.searchParams.set('start_date', startDate);
            url.searchParams.set('end_date', endDate);
            url.searchParams.set('page_size', '100');

            if (Array.isArray(sessionIds) && sessionIds.length) {
              url.searchParams.set('filtering', JSON.stringify({ room_ids: sessionIds.map(String) }));
            }

            const response = await fetchImpl(url.toString(), {
              method: 'GET',
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            });

            const payload = await response.json();
            if (payload?.code === 0 && Array.isArray(payload?.data?.list)) {
              for (const item of payload.data.list) {
                const roomId = item.dimensions?.room_id;
                const metrics = item.metrics || {};
                const cost = Number(metrics.cost ?? metrics.gmv_max_cost ?? metrics.net_cost ?? metrics.spend ?? 0);
                if (roomId && Number.isFinite(cost)) {
                  const shop = findShopForSession(item.dimensions?.store_id);
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
                      shopId: shop.id,
                      sessionId: String(roomId),
                      adsCost: cost,
                      currency: shop.region === 'VN' ? 'VND' : 'MYR',
                      advertiserId,
                      rawData: JSON.stringify(metrics),
                    },
                  });
                  results.push({ shop_id: shop.id, session_id: roomId, ads_cost: cost });
                }
              }
            } else if (payload?.code !== 0) {
              console.warn(`[TikTok Ads Sync] gmv_max/report/get returned error ${payload?.code}: ${payload?.message}`);
            }
          } catch (err) {
            console.warn(`[TikTok Ads Sync] GMV Max report error for advertiser ${advertiserId}:`, err.message);
          }
        }

        // 3. Query Integrated Report for standard Auction LIVE Shopping Ads
        try {
          const integUrl = new URL(`${baseUrl}/open_api/v1.3/report/integrated/get/`);
          integUrl.searchParams.set('advertiser_id', advertiserId);
          integUrl.searchParams.set('report_type', 'BASIC');
          integUrl.searchParams.set('data_level', 'AUCTION_AD');
          integUrl.searchParams.set('dimensions', JSON.stringify(['room_id']));
          integUrl.searchParams.set('metrics', JSON.stringify(['spend']));
          integUrl.searchParams.set('start_date', startDate);
          integUrl.searchParams.set('end_date', endDate);
          integUrl.searchParams.set('page_size', '100');

          if (Array.isArray(sessionIds) && sessionIds.length) {
            integUrl.searchParams.set('filtering', JSON.stringify({ room_ids: sessionIds.map(String) }));
          }

          const integRes = await fetchImpl(integUrl.toString(), {
            method: 'GET',
            headers: {
              'Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          });
          const integPayload = await integRes.json();
          if (integPayload?.code === 0 && Array.isArray(integPayload?.data?.list)) {
            for (const item of integPayload.data.list) {
              const roomId = item.dimensions?.room_id;
              const spend = Number(item.metrics?.spend ?? 0);
              if (roomId && Number.isFinite(spend) && spend > 0) {
                const shop = findShopForSession();
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
                  SET ads_cost = COALESCE(live_session_ads.ads_cost, 0) + EXCLUDED.ads_cost,
                      currency = EXCLUDED.currency,
                      source = 'api',
                      advertiser_id = EXCLUDED.advertiser_id,
                      raw_data = EXCLUDED.raw_data,
                      updated_at = NOW()
                  WHERE live_session_ads.source != 'manual' OR live_session_ads.ads_cost IS NULL
                `, {
                  replacements: {
                    shopId: shop.id,
                    sessionId: String(roomId),
                    adsCost: spend,
                    currency: shop.region === 'VN' ? 'VND' : 'MYR',
                    advertiserId,
                    rawData: JSON.stringify(item.metrics || {}),
                  },
                });
                results.push({ shop_id: shop.id, session_id: roomId, ads_cost: spend });
              }
            }
          }
        } catch (_integErr) {}
      }

      return results;
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

      const res = await fetchImpl(url.toString(), {
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

