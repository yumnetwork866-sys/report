const { TikTokApp } = require('../models');
const { encryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');
const { invalidateAppCache } = require('../services/tiktokAppService');

const serializeApp = (app) => {
  const data = app.get ? app.get({ plain: true }) : app;
  return {
    id: data.id,
    name: data.name,
    app_type: data.app_type,
    region: String(data.region || '').toUpperCase(),
    app_key: data.app_key,
    app_secret_masked: data.app_secret_encrypted ? '••••••••' : '',
    has_secret: Boolean(data.app_secret_encrypted),
    service_id: data.service_id || null,
    authorize_url: data.authorize_url || 'https://services.tiktokshop.com/open/authorize',
    redirect_uri: data.redirect_uri || null,
    is_active: Boolean(data.is_active),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
};

const listApps = async (req, res) => {
  try {
    const apps = await TikTokApp.findAll({
      order: [['app_type', 'ASC'], ['region', 'ASC'], ['name', 'ASC']],
    });
    res.json(apps.map(serializeApp));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createApp = async (req, res) => {
  try {
    const serviceId = String(req.body.service_id || '').trim() || null;
    let appType = String(req.body.app_type || '').trim().toLowerCase();
    if (!['partner', 'custom'].includes(appType)) {
      appType = serviceId ? 'partner' : 'custom';
    }

    let region = String(req.body.region || 'AUTO').trim().toUpperCase();
    if (!region) region = 'AUTO';

    let name = String(req.body.name || '').trim();
    if (!name) {
      name = appType === 'partner'
        ? (region === 'AUTO' ? 'TikTok Partner App' : `TikTok Partner ${region}`)
        : (region === 'AUTO' ? 'Custom App OMS' : `Custom App OMS ${region}`);
    }

    const appKey = String(req.body.app_key || '').trim();
    const appSecret = String(req.body.app_secret || '').trim();
    const authorizeUrl = String(req.body.authorize_url || '').trim() || 'https://services.tiktokshop.com/open/authorize';
    const redirectUri = String(req.body.redirect_uri || '').trim() || process.env.TIKTOK_PARTNER_REDIRECT_URI || null;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : true;

    if (!appKey) return res.status(400).json({ message: 'App Key là bắt buộc' });
    if (!appSecret) return res.status(400).json({ message: 'App Secret là bắt buộc' });

    const existing = await TikTokApp.findOne({
      where: { app_type: appType, region },
    });
    if (existing) {
      return res.status(409).json({ message: `Đã tồn tại App cho loại "${appType}" tại vùng "${region}"` });
    }

    const appSecretEncrypted = encryptPartnerToken(appSecret);

    const created = await TikTokApp.create({
      name,
      app_type: appType,
      region,
      app_key: appKey,
      app_secret_encrypted: appSecretEncrypted,
      service_id: serviceId,
      authorize_url: authorizeUrl,
      redirect_uri: redirectUri,
      is_active: isActive,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await invalidateAppCache();
    res.status(201).json(serializeApp(created));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateApp = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const app = await TikTokApp.findByPk(id);
    if (!app) return res.status(404).json({ message: 'Không tìm thấy App' });

    const serviceId = req.body.service_id !== undefined ? (String(req.body.service_id || '').trim() || null) : app.service_id;
    let appType = req.body.app_type !== undefined ? String(req.body.app_type || '').trim().toLowerCase() : app.app_type;
    if (!['partner', 'custom'].includes(appType)) {
      appType = serviceId ? 'partner' : 'custom';
    }

    let region = req.body.region !== undefined ? String(req.body.region || 'AUTO').trim().toUpperCase() : app.region;
    if (!region) region = 'AUTO';

    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : app.name;
    const appKey = req.body.app_key !== undefined ? String(req.body.app_key || '').trim() : app.app_key;
    const appSecret = String(req.body.app_secret || '').trim();
    const authorizeUrl = req.body.authorize_url !== undefined ? (String(req.body.authorize_url || '').trim() || 'https://services.tiktokshop.com/open/authorize') : app.authorize_url;
    const redirectUri = req.body.redirect_uri !== undefined ? (String(req.body.redirect_uri || '').trim() || process.env.TIKTOK_PARTNER_REDIRECT_URI || null) : app.redirect_uri;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : app.is_active;

    if (!name) return res.status(400).json({ message: 'Tên App là bắt buộc' });
    if (!appKey) return res.status(400).json({ message: 'App Key là bắt buộc' });

    if (appType !== app.app_type || region !== app.region) {
      const conflict = await TikTokApp.findOne({
        where: { app_type: appType, region },
      });
      if (conflict && conflict.id !== id) {
        return res.status(409).json({ message: `Đã tồn tại App cho loại "${appType}" tại vùng "${region}"` });
      }
    }

    const updates = {
      name,
      app_type: appType,
      region,
      app_key: appKey,
      service_id: serviceId,
      authorize_url: authorizeUrl,
      redirect_uri: redirectUri,
      is_active: isActive,
      updated_at: new Date(),
    };

    if (appSecret) {
      updates.app_secret_encrypted = encryptPartnerToken(appSecret);
    }

    await app.update(updates);
    await invalidateAppCache();
    res.json(serializeApp(app));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteApp = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const app = await TikTokApp.findByPk(id);
    if (!app) return res.status(404).json({ message: 'Không tìm thấy App' });

    await app.destroy();
    await invalidateAppCache();
    res.json({ success: true, message: 'Đã xóa App thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleAppStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const app = await TikTokApp.findByPk(id);
    if (!app) return res.status(404).json({ message: 'Không tìm thấy App' });

    const nextStatus = req.body.is_active !== undefined ? Boolean(req.body.is_active) : !app.is_active;
    await app.update({ is_active: nextStatus, updated_at: new Date() });
    await invalidateAppCache();
    res.json(serializeApp(app));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listApps,
  createApp,
  updateApp,
  deleteApp,
  toggleAppStatus,
};
