const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'Ads Cost', updated_at = NOW()
    WHERE job_key = 'tiktok_ads_live_performance'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'Chi phí Ads', updated_at = NOW()
    WHERE job_key = 'tiktok_ads_live_performance'
  `, { transaction });
};

module.exports = { name: '123_rename_tiktok_ads_scheduled_job_to_ads_cost', up, down };

