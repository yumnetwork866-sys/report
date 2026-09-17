const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_video_detail_snapshots (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      video_id VARCHAR(128) NOT NULL,
      metric_window VARCHAR(32) NOT NULL DEFAULT 'PAST_30_DAYS',
      start_date DATE,
      end_date DATE,
      views BIGINT,
      likes BIGINT,
      comments BIGINT,
      shares BIGINT,
      raw_metrics JSONB,
      synced_at TIMESTAMPTZ,
      last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT,
      UNIQUE (shop_id, video_id, metric_window)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_video_detail_snapshots_refresh_idx
    ON tiktok_video_detail_snapshots (shop_id, metric_window, synced_at)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_video_detail_snapshots', { transaction });
};

module.exports = { name: '078_create_tiktok_video_detail_snapshots', up, down };
