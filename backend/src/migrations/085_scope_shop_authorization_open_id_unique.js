const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_shop_authorizations
    DROP CONSTRAINT IF EXISTS tiktok_shop_authorizations_open_id_key;
  `, { transaction });

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tiktok_shop_authorizations_open_id_app_type_uidx
    ON tiktok_shop_authorizations (open_id, app_type)
    WHERE open_id IS NOT NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS tiktok_shop_authorizations_open_id_app_type_uidx;
  `, { transaction });

  await sequelize.query(`
    ALTER TABLE tiktok_shop_authorizations
    ADD CONSTRAINT tiktok_shop_authorizations_open_id_key UNIQUE (open_id);
  `, { transaction });
};

module.exports = { name: '085_scope_shop_authorization_open_id_unique', up, down };
