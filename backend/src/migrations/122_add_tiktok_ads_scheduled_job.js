const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (
      job_key, name, description, enabled, timezone, run_times, created_at, updated_at
    )
    VALUES (
      'tiktok_ads_live_performance',
      'Chi phí Ads',
      '',
      true,
      'Asia/Ho_Chi_Minh',
      '["06:00", "12:00", "18:00", "23:00"]'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (job_key) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = NOW();
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_ads_live_performance';
  `, { transaction });
};

module.exports = {
  name: '122_add_tiktok_ads_scheduled_job',
  up,
  down,
};
