const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_ads_authorizations
    ADD COLUMN IF NOT EXISTS advertiser_details JSONB NOT NULL DEFAULT '[]'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_ads_authorizations
    DROP COLUMN IF EXISTS advertiser_details
  `, { transaction });
};

module.exports = { name: '125_add_advertiser_details_to_tiktok_ads_authorizations', up, down };
