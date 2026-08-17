const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_creator_performance_backfill',
      'Creator Performance Daily Backfill',
      'Backfill one missing historical Creator Performance day per run.',
      FALSE,
      'Asia/Ho_Chi_Minh',
      '["11:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs
    WHERE job_key = 'tiktok_creator_performance_backfill'
  `, { transaction });
};

module.exports = { name: '068_add_creator_performance_backfill_schedule', up, down };
