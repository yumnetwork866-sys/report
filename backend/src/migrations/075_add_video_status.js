const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE videos
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS videos_status_idx;
    ALTER TABLE videos DROP COLUMN IF EXISTS status;
  `, { transaction });
};

module.exports = { name: '075_add_video_status', up, down };
