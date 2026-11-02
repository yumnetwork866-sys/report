const up = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE content_teams DROP COLUMN IF EXISTS legacy_key;', { transaction });
  await sequelize.query('ALTER TABLE videos DROP COLUMN IF EXISTS campaign;', { transaction });
  await sequelize.query('ALTER TABLE videos DROP COLUMN IF EXISTS content_type;', { transaction });

  await sequelize.query('DROP INDEX IF EXISTS tiktok_creator_contact_histories_recent_idx;', { transaction });
  await sequelize.query('ALTER TABLE tiktok_creator_contact_histories DROP COLUMN IF EXISTS last_messaged_at;', { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_creator_contact_histories_recent
    ON tiktok_creator_contact_histories (shop_id, last_invited_at DESC);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE content_teams ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(80) UNIQUE;', { transaction });
  await sequelize.query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS campaign VARCHAR(255);', { transaction });
  await sequelize.query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS content_type VARCHAR(255);', { transaction });
  await sequelize.query('ALTER TABLE tiktok_creator_contact_histories ADD COLUMN IF NOT EXISTS last_messaged_at TIMESTAMPTZ;', { transaction });

  await sequelize.query('DROP INDEX IF EXISTS idx_creator_contact_histories_recent;', { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_creator_contact_histories_recent_idx
    ON tiktok_creator_contact_histories (shop_id, last_invited_at DESC, last_messaged_at DESC);
  `, { transaction });
};

module.exports = {
  name: '110_drop_unused_legacy_columns',
  up,
  down,
};

