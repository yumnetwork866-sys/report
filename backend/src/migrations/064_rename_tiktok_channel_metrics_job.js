const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'TikTok Channel', updated_at = NOW()
    WHERE job_key = 'tiktok_channel_metrics'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'TikTok Channel Metrics', updated_at = NOW()
    WHERE job_key = 'tiktok_channel_metrics'
  `, { transaction });
};

module.exports = { name: '064_rename_tiktok_channel_metrics_job', up, down };
