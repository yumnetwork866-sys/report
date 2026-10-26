const { encryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const up = async ({ sequelize, transaction }) => {
  const appsToSeed = [
    {
      name: 'TikTok Partner Malaysia',
      app_type: 'partner',
      region: 'MY',
      app_key: String(process.env.TIKTOK_PARTNER_MY_APP_KEY || process.env.TIKTOK_PARTNER_APP_KEY || '').trim(),
      app_secret: String(process.env.TIKTOK_PARTNER_MY_APP_SECRET || process.env.TIKTOK_PARTNER_APP_SECRET || '').trim(),
      service_id: String(process.env.TIKTOK_PARTNER_MY_SERVICE_ID || process.env.TIKTOK_PARTNER_SERVICE_ID || '').trim() || null,
      authorize_url: String(process.env.TIKTOK_SHOP_AUTHORIZE_URL || 'https://services.tiktokshop.com/open/authorize').trim(),
      redirect_uri: String(process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim() || null,
    },
    {
      name: 'TikTok Partner Vietnam',
      app_type: 'partner',
      region: 'VN',
      app_key: String(process.env.TIKTOK_PARTNER_VN_APP_KEY || '').trim(),
      app_secret: String(process.env.TIKTOK_PARTNER_VN_APP_SECRET || '').trim(),
      service_id: String(process.env.TIKTOK_PARTNER_VN_SERVICE_ID || '').trim() || null,
      authorize_url: String(process.env.TIKTOK_SHOP_VN_AUTHORIZE_URL || process.env.TIKTOK_SHOP_AUTHORIZE_URL || 'https://services.tiktokshop.com/open/authorize').trim(),
      redirect_uri: String(process.env.TIKTOK_PARTNER_VN_REDIRECT_URI || process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim() || null,
    },
    {
      name: 'Custom App OMS Vietnam',
      app_type: 'custom',
      region: 'VN',
      app_key: String(process.env.TIKTOK_SHOP_CUSTOM_APP_KEY || '').trim(),
      app_secret: String(process.env.TIKTOK_SHOP_CUSTOM_APP_SECRET || '').trim(),
      service_id: String(process.env.TIKTOK_SHOP_CUSTOM_SERVICE_ID || '').trim() || null,
      authorize_url: String(process.env.TIKTOK_SHOP_CUSTOM_AUTHORIZE_URL || process.env.TIKTOK_SHOP_AUTHORIZE_URL || 'https://services.tiktokshop.com/open/authorize').trim(),
      redirect_uri: String(process.env.TIKTOK_SHOP_CUSTOM_REDIRECT_URL || process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim() || null,
    },
  ];

  for (const app of appsToSeed) {
    if (!app.app_key || !app.app_secret) continue;

    let encryptedSecret;
    try {
      encryptedSecret = encryptPartnerToken(app.app_secret);
    } catch {
      // In tests without encryption key, skip
      continue;
    }

    if (!encryptedSecret) continue;

    await sequelize.query(`
      INSERT INTO tiktok_apps (
        name, app_type, region, app_key, app_secret_encrypted,
        service_id, authorize_url, redirect_uri, is_active,
        created_at, updated_at
      )
      VALUES (
        :name, :app_type, :region, :app_key, :app_secret_encrypted,
        :service_id, :authorize_url, :redirect_uri, true,
        NOW(), NOW()
      )
      ON CONFLICT (app_type, region) DO NOTHING;
    `, {
      replacements: {
        name: app.name,
        app_type: app.app_type,
        region: app.region,
        app_key: app.app_key,
        app_secret_encrypted: encryptedSecret,
        service_id: app.service_id,
        authorize_url: app.authorize_url,
        redirect_uri: app.redirect_uri,
      },
      transaction,
    });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM tiktok_apps
    WHERE app_key IN (
      :myKey, :vnKey, :customKey
    )
  `, {
    replacements: {
      myKey: String(process.env.TIKTOK_PARTNER_MY_APP_KEY || '').trim(),
      vnKey: String(process.env.TIKTOK_PARTNER_VN_APP_KEY || '').trim(),
      customKey: String(process.env.TIKTOK_SHOP_CUSTOM_APP_KEY || '').trim(),
    },
    transaction,
  });
};

module.exports = { name: '092_seed_initial_tiktok_apps', up, down };
