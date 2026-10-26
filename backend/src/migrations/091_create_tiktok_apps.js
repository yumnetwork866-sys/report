const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_apps (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      app_type VARCHAR(32) NOT NULL DEFAULT 'partner',
      region VARCHAR(16) NOT NULL,
      app_key VARCHAR(128) NOT NULL,
      app_secret_encrypted TEXT NOT NULL,
      service_id VARCHAR(128),
      authorize_url VARCHAR(255) DEFAULT 'https://services.tiktokshop.com/open/authorize',
      redirect_uri VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tiktok_apps_app_type_region_uidx
      ON tiktok_apps (app_type, region);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_apps CASCADE;', { transaction });
};

module.exports = { name: '091_create_tiktok_apps', up, down };
