const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_ads_authorizations (
      id SERIAL PRIMARY KEY,
      app_id VARCHAR(64) NOT NULL,
      access_token TEXT NOT NULL,
      advertiser_ids JSONB NOT NULL DEFAULT '[]',
      scope TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS live_session_ads (
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      session_id VARCHAR(128) NOT NULL,
      ads_cost DECIMAL(20, 4) DEFAULT NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'MYR',
      source VARCHAR(32) NOT NULL DEFAULT 'manual',
      advertiser_id VARCHAR(64) DEFAULT NULL,
      raw_data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shop_id, session_id)
    )
  `, { transaction });

  await sequelize.query('CREATE INDEX IF NOT EXISTS live_session_ads_shop_idx ON live_session_ads (shop_id)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS live_session_ads', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_ads_authorizations', { transaction });
};

module.exports = { name: '120_create_tiktok_ads_and_live_session_ads', up, down };

