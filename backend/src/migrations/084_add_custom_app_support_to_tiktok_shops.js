const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_shop_authorizations
    ADD COLUMN IF NOT EXISTS app_type VARCHAR(32) NOT NULL DEFAULT 'partner';
  `, { transaction });

  await sequelize.query(`
    ALTER TABLE tiktok_shops
    ADD COLUMN IF NOT EXISTS order_authorization_id INTEGER REFERENCES tiktok_shop_authorizations(id) ON DELETE SET NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE tiktok_shops DROP COLUMN IF EXISTS order_authorization_id;', { transaction });
  await sequelize.query('ALTER TABLE tiktok_shop_authorizations DROP COLUMN IF EXISTS app_type;', { transaction });
};

module.exports = { name: '084_add_custom_app_support_to_tiktok_shops', up, down };
