const { encryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const up = async ({ sequelize, transaction }) => {
  const appKey = String(process.env.TIKTOK_BUSINESS_APP_ID || '7709534514481283092').trim();
  const appSecret = String(process.env.TIKTOK_BUSINESS_SECRET || '01ed165188d088f5fcf477d3b699cd90a1f45365').trim();
  const authorizeUrl = 'https://business-api.tiktok.com/portal/auth';
  const redirectUri = String(process.env.TIKTOK_BUSINESS_REDIRECT_URI || 'https://report-api.yumnetwork.vn/api/ads/oauth/callback').trim();

  if (!appKey || !appSecret) return;

  let encryptedSecret;
  try {
    encryptedSecret = encryptPartnerToken(appSecret);
  } catch {
    return;
  }

  if (!encryptedSecret) return;

  await sequelize.query(`
    INSERT INTO tiktok_apps (
      name, app_type, region, app_key, app_secret_encrypted,
      service_id, authorize_url, redirect_uri, capabilities, is_active,
      created_at, updated_at
    )
    VALUES (
      'YUM Ads Dashboard', 'ads', 'ALL', :appKey, :encryptedSecret,
      NULL, :authorizeUrl, :redirectUri, '["ads"]'::jsonb, true,
      NOW(), NOW()
    )
    ON CONFLICT (app_key) DO UPDATE
    SET name = EXCLUDED.name,
        app_type = EXCLUDED.app_type,
        app_secret_encrypted = EXCLUDED.app_secret_encrypted,
        authorize_url = EXCLUDED.authorize_url,
        redirect_uri = EXCLUDED.redirect_uri,
        capabilities = EXCLUDED.capabilities,
        updated_at = NOW();
  `, {
    replacements: { appKey, encryptedSecret, authorizeUrl, redirectUri },
    transaction,
  });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM tiktok_apps WHERE app_type = 'ads';
  `, { transaction });
};

module.exports = { name: '121_seed_tiktok_ads_app', up, down };

