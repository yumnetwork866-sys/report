const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET enabled = FALSE, updated_at = NOW()
    WHERE job_key = 'tiktok_creator_performance_backfill'
  `, { transaction });

  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_booking_video_detail',
      'TikTok Booking Video Detail',
      'Refresh the latest 30-day interaction snapshot for active Booking videos with safe pacing and rate-limit cooldown.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["08:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs
    WHERE job_key = 'tiktok_booking_video_detail'
  `, { transaction });

  await sequelize.query(`
    UPDATE scheduled_jobs
    SET enabled = FALSE, updated_at = NOW()
    WHERE job_key = 'tiktok_creator_performance_backfill'
  `, { transaction });
};

module.exports = { name: '080_split_booking_video_detail_schedule', up, down };
