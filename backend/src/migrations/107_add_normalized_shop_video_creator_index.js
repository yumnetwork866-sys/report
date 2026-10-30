const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_shop_videos_normalized_creator
    ON shop_videos (lower(trim(leading '@' from coalesce(creator_username, ''))), shop_id);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS idx_shop_videos_normalized_creator;', { transaction });
};

module.exports = { name: '107_add_normalized_shop_video_creator_index', up, down };
