const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS channel_report_video_revenue_daily (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      platform_video_id VARCHAR(64) NOT NULL,
      metric_date DATE NOT NULL,
      account_type VARCHAR(32) NOT NULL,
      revenue NUMERIC(20, 4) NOT NULL DEFAULT 0,
      currency VARCHAR(16),
      raw_metrics JSONB,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, platform_video_id, metric_date)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS channel_report_video_revenue_daily_date_video_idx
    ON channel_report_video_revenue_daily (metric_date, platform_video_id)
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS channel_report_revenue_sync_days (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      video_count INTEGER NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, metric_date)
    )
  `, { transaction });

  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_channel_report_revenue',
      'TikTok Channel Report GMV',
      'Synchronize daily video-attributed GMV used by the Channel Report.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["06:30"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query("DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_channel_report_revenue'", { transaction });
  await sequelize.query('DROP TABLE IF EXISTS channel_report_revenue_sync_days', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS channel_report_video_revenue_daily', { transaction });
};

module.exports = { name: '061_create_channel_report_revenue_daily', up, down };
