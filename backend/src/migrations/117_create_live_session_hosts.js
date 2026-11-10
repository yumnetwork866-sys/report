const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS live_session_hosts (
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      session_id VARCHAR(128) NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shop_id, session_id)
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS live_session_hosts_user_idx ON live_session_hosts (user_id)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS live_session_hosts', { transaction });
};

module.exports = { name: '117_create_live_session_hosts', up, down };
