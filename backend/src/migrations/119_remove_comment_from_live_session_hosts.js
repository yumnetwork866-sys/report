const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM live_session_hosts WHERE user_id IS NULL;
    ALTER TABLE live_session_hosts
      DROP COLUMN IF EXISTS comment;
    ALTER TABLE live_session_hosts
      ALTER COLUMN user_id SET NOT NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE live_session_hosts
      ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE live_session_hosts
      ADD COLUMN IF NOT EXISTS comment TEXT;
  `, { transaction });
};

module.exports = { name: '119_remove_comment_from_live_session_hosts', up, down };
