const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET
      run_times = '["14:30"]'::jsonb,
      timezone = 'Asia/Ho_Chi_Minh',
      enabled = TRUE,
      updated_at = NOW()
    WHERE job_key = 'tiktok_creator_performance'
  `, { transaction });

  await sequelize.query(`
    UPDATE tiktok_api_cooldowns
    SET
      consecutive_rate_limits = 0,
      cooldown_until = LEAST(cooldown_until, NOW()),
      updated_at = NOW()
    WHERE namespace = 'creator_performance_compass'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET
      run_times = '["07:00"]'::jsonb,
      updated_at = NOW()
    WHERE job_key = 'tiktok_creator_performance'
  `, { transaction });
};

module.exports = { name: "070_update_creator_performance_schedule", up, down };
