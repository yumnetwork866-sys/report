const { encryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const up = async ({ sequelize, transaction }) => {
  const appKey = String(process.env.TIKTOK_CLIENT_KEY || '').trim();
  const appSecret = String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
  const authorizeUrl = String(process.env.TIKTOK_OAUTH_AUTHORIZE_BASE_URL || 'https://www.tiktok.com/v2/auth/authorize/').trim();
  const redirectUri = String(process.env.TIKTOK_REDIRECT_URI || '').trim() || null;

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
      service_id, authorize_url, redirect_uri, is_active,
      created_at, updated_at
    )
    VALUES (
      'TikTok Channel', 'channel', 'ALL', :appKey, :encryptedSecret,
      NULL, :authorizeUrl, :redirectUri, true,
      NOW(), NOW()
    )
    ON CONFLICT (app_type, region) DO UPDATE
    SET name = EXCLUDED.name,
        app_key = EXCLUDED.app_key,
        app_secret_encrypted = EXCLUDED.app_secret_encrypted,
        authorize_url = EXCLUDED.authorize_url,
        redirect_uri = EXCLUDED.redirect_uri,
        updated_at = NOW();
  `, {
    replacements: { appKey, encryptedSecret, authorizeUrl, redirectUri },
    transaction,
  });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM tiktok_apps WHERE app_type = 'channel';
  `, { transaction });
};

module.exports = { name: '095_seed_tiktok_channel_app', up, down };
