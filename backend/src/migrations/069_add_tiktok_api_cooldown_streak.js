const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_api_cooldowns
    ADD COLUMN IF NOT EXISTS consecutive_rate_limits INTEGER NOT NULL DEFAULT 0
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_api_cooldowns
    DROP COLUMN IF EXISTS consecutive_rate_limits
  `, { transaction });
};

module.exports = { name: '069_add_tiktok_api_cooldown_streak', up, down };
