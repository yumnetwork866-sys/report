const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE UNIQUE INDEX tiktok_shop_authorizations_app_open_id_uidx
    ON tiktok_shop_authorizations (app_id, open_id)
    WHERE app_id IS NOT NULL AND open_id IS NOT NULL;

    CREATE UNIQUE INDEX tiktok_shop_authorizations_legacy_open_id_uidx
    ON tiktok_shop_authorizations (open_id, app_type)
    WHERE app_id IS NULL AND open_id IS NOT NULL;

    DROP INDEX IF EXISTS tiktok_shop_authorizations_open_id_app_type_uidx;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  // If multiple apps now share an open_id, restoring the old uniqueness rule
  // fails rather than deleting either connection to make it fit.
  await sequelize.query(`
    CREATE UNIQUE INDEX tiktok_shop_authorizations_open_id_app_type_uidx
    ON tiktok_shop_authorizations (open_id, app_type)
    WHERE open_id IS NOT NULL;

    DROP INDEX tiktok_shop_authorizations_app_open_id_uidx;
    DROP INDEX tiktok_shop_authorizations_legacy_open_id_uidx;
  `, { transaction });
};

module.exports = { name: '114_scope_shop_authorizations_to_app', up, down };
