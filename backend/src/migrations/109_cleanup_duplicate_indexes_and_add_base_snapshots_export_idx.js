const up = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS tiktok_partner_authorizations_creator_id_idx;', { transaction });
  await sequelize.query('DROP INDEX IF EXISTS tiktok_partner_authorizations_open_id_idx;', { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_base_performance_snapshots_export_id
    ON tiktok_base_performance_snapshots (export_id);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS idx_tiktok_base_performance_snapshots_export_id;', { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_partner_authorizations_creator_id_idx
    ON tiktok_partner_authorizations (creator_id);
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_partner_authorizations_open_id_idx
    ON tiktok_partner_authorizations (open_id);
  `, { transaction });
};

module.exports = {
  name: '109_cleanup_duplicate_indexes_and_add_base_snapshots_export_idx',
  up,
  down,
};
