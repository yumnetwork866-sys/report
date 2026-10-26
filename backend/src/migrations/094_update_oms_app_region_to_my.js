const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE tiktok_apps
    SET name = 'OMS Malaysia',
        region = 'MY',
        updated_at = NOW()
    WHERE app_type = 'custom' AND (region = 'VN' OR name ILIKE '%oms%');
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE tiktok_apps
    SET name = 'OMS Việt Nam',
        region = 'VN',
        updated_at = NOW()
    WHERE app_type = 'custom' AND region = 'MY';
  `, { transaction });
};

module.exports = { name: '094_update_oms_app_region_to_my', up, down };
