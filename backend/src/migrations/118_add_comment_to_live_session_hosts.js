const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE live_session_hosts
      ADD COLUMN IF NOT EXISTS comment TEXT;
    ALTER TABLE live_session_hosts
      ALTER COLUMN user_id DROP NOT NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE live_session_hosts
      DROP COLUMN IF EXISTS comment;
  `, { transaction });
};

module.exports = { name: '118_add_comment_to_live_session_hosts', up, down };
