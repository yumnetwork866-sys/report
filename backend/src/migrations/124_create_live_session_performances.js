const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS live_session_performances (
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      session_id VARCHAR(128) NOT NULL,
      title TEXT,
      creator_username VARCHAR(255),
      creator_nickname VARCHAR(255),
      author_type VARCHAR(64),
      start_time BIGINT,
      end_time BIGINT,
      duration_seconds INTEGER,
      total_comments INTEGER,
      hashtags JSONB NOT NULL DEFAULT '[]',
      interaction_performance JSONB DEFAULT NULL,
      raw_data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shop_id, session_id)
    )
  `, { transaction });

  await sequelize.query('CREATE INDEX IF NOT EXISTS live_session_performances_shop_idx ON live_session_performances (shop_id)', { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS live_session_performances_start_time_idx ON live_session_performances (start_time)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS live_session_performances', { transaction });
};

module.exports = { name: '124_create_live_session_performances', up, down };
