const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs
    WHERE job_key = 'tiktok_booking_video_detail'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_booking_video_detail',
      'TikTok Booking Video Detail',
      'Refresh the latest 30-day interaction snapshot for active Booking videos with safe pacing and rate-limit cooldown.',
      FALSE,
      'Asia/Ho_Chi_Minh',
      '["08:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

module.exports = { name: '116_remove_tiktok_booking_video_detail_job', up, down };
