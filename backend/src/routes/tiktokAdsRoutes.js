const express = require('express');
const tiktokAdsService = require('../services/tiktokAdsService');
const { requireAdmin, requirePermission, requireAnyPermission } = require('../lib/session');

const router = express.Router();

// 1. Get OAuth authorization URL (Admin only)
router.get('/oauth/url', requireAdmin, requirePermission('admin.shops.manage'), async (req, res) => {
  try {
    const state = req.query.state || 'tiktok_ads_connect';
    const url = await tiktokAdsService.getAuthUrl(state);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Public OAuth Callback from TikTok Business Developers
router.get('/oauth/callback', async (req, res) => {
  const authCode = req.query.auth_code || req.query.code;
  const frontendUrl = process.env.FRONTEND_URL || 'https://report.yumnetwork.vn';

  if (!authCode) {
    return res.redirect(`${frontendUrl}/tiktok/live?ads_error=${encodeURIComponent('No auth code provided')}`);
  }

  try {
    await tiktokAdsService.handleOAuthCallback(authCode);
    res.redirect(`${frontendUrl}/tiktok/live?ads_connected=true`);
  } catch (err) {
    console.error('[TikTok Ads OAuth Callback Error]', err);
    res.redirect(`${frontendUrl}/tiktok/live?ads_error=${encodeURIComponent(err.message)}`);
  }
});

// 3. Get connection status & connected advertiser accounts
router.get('/status', requireAdmin, requireAnyPermission(['admin.shops.manage', 'shop.analytics.view']), async (_req, res) => {
  try {
    const status = await tiktokAdsService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. Get Ads cost for live sessions (auto-synced from TikTok API by session_id)
const handleLiveSessions = async (req, res) => {
  try {
    const shopId = req.body?.shop_id || req.query.shop_id || null;
    let sessionIds = req.body?.session_ids || req.query.session_ids;
    if (sessionIds && !Array.isArray(sessionIds)) {
      sessionIds = [sessionIds];
    }
    const sessions = Array.isArray(req.body?.sessions)
      ? req.body.sessions
      : (typeof req.query.sessions === 'string' ? JSON.parse(req.query.sessions) : []);

    const rows = await tiktokAdsService.getLiveSessionAds(shopId, { sessionIds, sessions });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

router.get('/live-sessions', requireAdmin, requirePermission('shop.analytics.view'), handleLiveSessions);
router.post('/live-sessions', requireAdmin, requirePermission('shop.analytics.view'), handleLiveSessions);

// 5. Manual trigger to sync live session ads
router.post('/sync', requireAdmin, requirePermission('shop.analytics.view'), async (req, res) => {
  try {
    const shopId = req.body?.shop_id || req.query.shop_id || null;
    const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
    const results = await tiktokAdsService.syncLiveSessionAds({ shopId, sessions });
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. Update or manually set Ads cost for a live session
router.put('/shops/:shopId/live-sessions/:sessionId', requireAdmin, requirePermission('admin.shops.manage'), async (req, res) => {
  try {
    const { shopId, sessionId } = req.params;
    const { ads_cost, currency, source, advertiser_id } = req.body;

    const result = await tiktokAdsService.saveLiveSessionAds({
      shopId,
      sessionId,
      adsCost: ads_cost,
      currency,
      source: source || 'manual',
      advertiserId: advertiser_id || null,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

