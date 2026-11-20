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

    async getLiveSessionAds(shopId = null, { sync = true, sessionIds = [], sessions = [] } = {}) {
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

    async syncLiveSessionAds({ shopId = null, sessionIds = [], sessions = [] } = {}) {
      const authRows = await select(`
        SELECT access_token, advertiser_ids FROM tiktok_ads_authorizations ORDER BY updated_at DESC LIMIT 1
      `);
      if (!authRows.length) return [];

      const { access_token: accessToken, advertiser_ids: rawAdvertisers } = authRows[0];
      let advertiserIds = Array.isArray(rawAdvertisers)
        ? rawAdvertisers
        : (typeof rawAdvertisers === 'string' ? JSON.parse(rawAdvertisers || '[]') : []);

      const { appId, secret, baseUrl } = await getBusinessConfig(db);

      // 1. Resolve advertiser IDs if empty
      if (!advertiserIds.length && appId && secret) {
        const versions = ['v1.3', 'v2.0'];
        for (const ver of versions) {
          try {
            const advUrl = new URL(`${baseUrl}/open_api/${ver}/oauth2/advertiser/get/`);
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
                break;
              }
            }
          } catch (advErr) {
            console.warn(`[TikTok Ads Sync] Could not fetch advertiser list on ${ver}:`, advErr.message);
          }
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
      const formatDateInTz = (dateOrEpoch, timeZone = 'Asia/Kuala_Lumpur') => {
        try {
          const d = typeof dateOrEpoch === 'number' ? new Date(dateOrEpoch) : new Date(dateOrEpoch);
          return d.toLocaleDateString('en-CA', { timeZone });
        } catch (_e) {
          const d = new Date(dateOrEpoch);
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }
      };
      const endDate = formatDate(now);
      // Synchronous report API allows up to 30 days for stat_time_day
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

      // Also find sessions from database orders and hosts if available
      const dbLiveSessions = await select(`
        SELECT DISTINCT s.shop_id, s.content_id AS session_id,
               TO_CHAR(o.create_time AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS session_date
        FROM tiktok_affiliate_order_skus s
        JOIN tiktok_affiliate_orders o ON o.id = s.affiliate_order_id
        WHERE s.content_type = 'LIVE' AND s.content_id IS NOT NULL
          AND (:shopId::int IS NULL OR s.shop_id = :shopId)
      `, { shopId: shopId ? Number(shopId) : null });

      const knownSessionsByDate = {};
      const registerSessionDate = (sid, spId, dateStr, gmv = 0) => {
        if (!sid || !dateStr) return;
        const d = String(dateStr).slice(0, 10);
        if (!knownSessionsByDate[d]) knownSessionsByDate[d] = [];
        const existing = knownSessionsByDate[d].find((x) => x.sessionId === String(sid));
        if (!existing) {
          knownSessionsByDate[d].push({ sessionId: String(sid), shopId: spId, gmv: Number(gmv) || 0 });
        } else if (gmv > 0) {
          existing.gmv = Math.max(existing.gmv, Number(gmv));
        }
      };

      dbLiveSessions.forEach((row) => registerSessionDate(row.session_id, row.shop_id, row.session_date));

      if (Array.isArray(sessions)) {
        sessions.forEach((s) => {
          const sid = s.session_id || s.sessionId || s.live_id || s.id;
          const spId = s.shop_id || s.shopId || (targetShops[0]?.id || 1);
          const gmv = Number(s.gmv?.amount || s.gmv || s.revenue?.amount || s.revenue || 0);
          if (s.start_time || s.startTime) {
            const timeNum = Number(s.start_time || s.startTime);
            if (Number.isFinite(timeNum) && timeNum > 0) {
              const epoch = timeNum > 1e12 ? timeNum : timeNum * 1000;
              const tzDate = formatDateInTz(epoch, 'Asia/Kuala_Lumpur');
              const utcDate = formatDateInTz(epoch, 'UTC');
              if (sid) {
                registerSessionDate(sid, spId, tzDate, gmv);
                if (utcDate !== tzDate) {
                  registerSessionDate(sid, spId, utcDate, gmv);
                }
              }
            }
          }
        });
      }

      if (Array.isArray(sessionIds)) {
        sessionIds.forEach((sid) => {
          if (sid) registerSessionDate(sid, targetShops[0]?.id || 1, endDate);
        });
      }

      for (const advertiserId of advertiserIds) {
        const sessionSpendAccumulator = new Map();
        const recordSpend = (sId, spId, amount, rawMeta = {}) => {
          if (!sId || !Number.isFinite(amount) || amount <= 0) return;
          const key = `${spId}:${sId}`;
          const current = sessionSpendAccumulator.get(key) || {
            sessionId: String(sId),
            shopId: spId,
            cost: 0,
            rawMeta: {},
          };
          current.cost += amount;
          current.rawMeta = { ...current.rawMeta, ...rawMeta };
          sessionSpendAccumulator.set(key, current);
        };

        // --- A. RUN SYNCHRONOUS REPORT (https://business-api.tiktok.com/portal/docs/run-a-synchronous-report/v2.0) ---
        // Endpoint: /open_api/v2.0/report/integrated/get/ and /open_api/v1.3/report/integrated/get/
        let syncReportList = null;
        const reportConfigs = [
          // 1. Campaign level v2.0
          { ver: 'v2.0', serviceType: 'AUCTION', dataLevel: 'AUCTION_CAMPAIGN', dimensions: ['campaign_id', 'stat_time_day'], metrics: ['spend', 'impressions', 'clicks'] },
          // 2. Campaign level v1.3
          { ver: 'v1.3', serviceType: 'AUCTION', dataLevel: 'AUCTION_CAMPAIGN', dimensions: ['campaign_id', 'stat_time_day'], metrics: ['spend', 'impressions', 'clicks'] },
          // 3. Campaign level v2.0 without service_type
          { ver: 'v2.0', serviceType: null, dataLevel: 'AUCTION_CAMPAIGN', dimensions: ['campaign_id', 'stat_time_day'], metrics: ['spend', 'impressions', 'clicks'] },
          // 4. Advertiser daily level v2.0
          { ver: 'v2.0', serviceType: 'AUCTION', dataLevel: 'AUCTION_ADVERTISER', dimensions: ['stat_time_day'], metrics: ['spend', 'impressions', 'clicks'] },
          // 5. Advertiser daily level v1.3
          { ver: 'v1.3', serviceType: 'AUCTION', dataLevel: 'AUCTION_ADVERTISER', dimensions: ['stat_time_day'], metrics: ['spend', 'impressions', 'clicks'] },
          // 6. Advertiser daily level without service_type
          { ver: 'v2.0', serviceType: null, dataLevel: 'AUCTION_ADVERTISER', dimensions: ['stat_time_day'], metrics: ['spend'] },
        ];

        for (const cfg of reportConfigs) {
          try {
            const syncUrl = new URL(`${baseUrl}/open_api/${cfg.ver}/report/integrated/get/`);
            syncUrl.searchParams.set('advertiser_id', advertiserId);
            if (cfg.serviceType) syncUrl.searchParams.set('service_type', cfg.serviceType);
            syncUrl.searchParams.set('report_type', 'BASIC');
            syncUrl.searchParams.set('data_level', cfg.dataLevel);
            syncUrl.searchParams.set('dimensions', JSON.stringify(cfg.dimensions));
            syncUrl.searchParams.set('metrics', JSON.stringify(cfg.metrics));
            syncUrl.searchParams.set('start_date', startDate);
            syncUrl.searchParams.set('end_date', endDate);
            syncUrl.searchParams.set('page_size', '1000');

            const reportRes = await fetchImpl(syncUrl.toString(), {
              method: 'GET',
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            });
            const reportPayload = await reportRes.json();
            if (reportPayload?.code === 0 && Array.isArray(reportPayload?.data?.list) && reportPayload.data.list.length > 0) {
              syncReportList = reportPayload.data.list;
              break;
            } else if (reportPayload?.code !== 0) {
              console.warn(`[TikTok Synchronous Report ${cfg.ver} ${cfg.dataLevel}] Code ${reportPayload?.code}: ${reportPayload?.message}`);
            }
          } catch (syncErr) {
            console.warn(`[TikTok Synchronous Report ${cfg.ver} ${cfg.dataLevel}] Error:`, syncErr.message);
          }
        }

        // Process Synchronous Report rows
        if (Array.isArray(syncReportList)) {
          for (const row of syncReportList) {
            const rawDate = row.dimensions?.stat_time_day;
            const dateKey = rawDate ? String(rawDate).slice(0, 10) : null;
            const spend = Number(row.metrics?.spend ?? row.metrics?.stat_cost ?? row.metrics?.cost ?? 0);

            if (dateKey && Number.isFinite(spend) && spend > 0) {
              const matchedSessions = knownSessionsByDate[dateKey] || [];
              if (matchedSessions.length > 0) {
                const gmvSessions = matchedSessions.filter((s) => s.gmv > 0);
                if (gmvSessions.length === 1) {
                  recordSpend(gmvSessions[0].sessionId, gmvSessions[0].shopId, spend, row.metrics);
                } else if (gmvSessions.length > 1) {
                  const totalGmv = gmvSessions.reduce((acc, s) => acc + s.gmv, 0);
                  for (const s of gmvSessions) {
                    const allocated = Number(((s.gmv / totalGmv) * spend).toFixed(2));
                    recordSpend(s.sessionId, s.shopId, allocated, row.metrics);
                  }
                } else if (matchedSessions.length === 1) {
                  recordSpend(matchedSessions[0].sessionId, matchedSessions[0].shopId, spend, row.metrics);
                } else {
                  recordSpend(matchedSessions[0].sessionId, matchedSessions[0].shopId, spend, row.metrics);
                }
              }
            }
          }
        }

        // --- B. QUERY GMV MAX CAMPAIGN REPORT (https://business-api.tiktok.com/open_api/v1.3/gmv_max/report/get/) ---
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
            // TikTok doc: confirm is_gmv_max_available is true if provided
            storeIds = storeData.data.list
              .filter((s) => s.is_gmv_max_available !== false)
              .map((s) => String(s.store_id || s.id || ''))
              .filter(Boolean);
          }
        } catch (storeErr) {
          console.warn(`[TikTok Ads Sync] gmv_max/store/list failed: ${storeErr.message}`);
        }

        if (!storeIds.length) {
          storeIds = targetShops.map((s) => String(s.platform_shop_id)).filter(Boolean);
        }

        const uniqueStoreIds = [...new Set(storeIds)];
        // TikTok GMV Max doc: store_ids Max size: 1 -> query each store separately
        for (const singleStoreId of uniqueStoreIds) {
          // Try LIVE GMV Max dimension: room_id first, then with stat_time_day
          const gmvConfigs = [
            {
              dimensions: ['room_id'],
              metrics: ['cost', 'net_cost', 'orders', 'gross_revenue', 'roi'],
              filtering: { gmv_max_promotion_types: ['LIVE'] },
            },
            {
              dimensions: ['room_id'],
              metrics: ['cost', 'net_cost', 'orders', 'gross_revenue', 'roi'],
              filtering: null,
            },
            {
              dimensions: ['room_id', 'stat_time_day'],
              metrics: ['cost', 'gross_revenue', 'orders'],
              filtering: null,
            },
            {
              dimensions: ['campaign_id', 'stat_time_day'],
              metrics: ['cost', 'gross_revenue', 'orders'],
              filtering: null,
            },
          ];

          for (const gmvCfg of gmvConfigs) {
            try {
              const url = new URL(`${baseUrl}/open_api/v1.3/gmv_max/report/get/`);
              url.searchParams.set('advertiser_id', advertiserId);
              url.searchParams.set('store_ids', JSON.stringify([String(singleStoreId)]));
              url.searchParams.set('dimensions', JSON.stringify(gmvCfg.dimensions));
              url.searchParams.set('metrics', JSON.stringify(gmvCfg.metrics));
              url.searchParams.set('start_date', startDate);
              url.searchParams.set('end_date', endDate);
              url.searchParams.set('page_size', '1000');
              url.searchParams.set('page', '1');

              if (gmvCfg.filtering) {
                url.searchParams.set('filtering', JSON.stringify(gmvCfg.filtering));
              }

              const res = await fetchImpl(url.toString(), {
                method: 'GET',
                headers: {
                  'Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
              });
              const payload = await res.json();
              if (payload?.code === 0 && Array.isArray(payload?.data?.list) && payload.data.list.length > 0) {
                console.log(`[TikTok Ads Sync] GMV Max report returned ${payload.data.list.length} rows for store ${singleStoreId}`);
                for (const item of payload.data.list) {
                  const roomId = item.dimensions?.room_id;
                  const dateKey = item.dimensions?.stat_time_day ? String(item.dimensions.stat_time_day).slice(0, 10) : null;
                  const metrics = item.metrics || {};
                  const cost = Number(metrics.cost ?? metrics.net_cost ?? 0);
                  if (!Number.isFinite(cost) || cost <= 0) continue;

                  if (roomId) {
                    const shop = findShopForSession(singleStoreId);
                    recordSpend(roomId, shop.id, cost, metrics);
                  } else if (dateKey) {
                    const matchedSessions = knownSessionsByDate[dateKey] || [];
                    if (matchedSessions.length > 0) {
                      const gmvSessions = matchedSessions.filter((s) => s.gmv > 0);
                      if (gmvSessions.length === 1) {
                        recordSpend(gmvSessions[0].sessionId, gmvSessions[0].shopId, cost, metrics);
                      } else if (gmvSessions.length > 1) {
                        const totalGmv = gmvSessions.reduce((acc, s) => acc + s.gmv, 0);
                        for (const s of gmvSessions) {
                          const allocated = Number(((s.gmv / totalGmv) * cost).toFixed(2));
                          recordSpend(s.sessionId, s.shopId, allocated, metrics);
                        }
                      } else {
                        recordSpend(matchedSessions[0].sessionId, matchedSessions[0].shopId, cost, metrics);
                      }
                    }
                  }
                }
                break; // Stop falling back for this store if successful
              } else if (payload?.code !== 0) {
                console.warn(`[TikTok Ads Sync] GMV Max error code ${payload?.code}: ${payload?.message}`);
              }
            } catch (gmvErr) {
              console.warn(`[TikTok Ads Sync] GMV Max request failed: ${gmvErr.message}`);
            }
          }
        }

        // --- C. PERSIST ACCUMULATED SPEND INTO DATABASE ---
        for (const item of sessionSpendAccumulator.values()) {
          const shop = findShopForSession(item.shopId);
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
              shopId: item.shopId || shop.id,
              sessionId: String(item.sessionId),
              adsCost: Number(item.cost),
              currency: shop.region === 'VN' ? 'VND' : 'MYR',
              advertiserId,
              rawData: JSON.stringify(item.rawMeta || {}),
            },
          });
          results.push({
            shop_id: item.shopId || shop.id,
            session_id: String(item.sessionId),
            ads_cost: Number(item.cost),
          });
        }
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

