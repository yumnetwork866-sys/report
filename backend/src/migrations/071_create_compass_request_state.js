const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_compass_request_gates (
      bucket_key VARCHAR(64) PRIMARY KEY,
      next_request_at TIMESTAMPTZ,
      cooldown_until TIMESTAMPTZ,
      consecutive_rate_limits INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_compass_export_intents (
      request_key VARCHAR(64) PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'NEW',
      task_id VARCHAR(255),
      request_id VARCHAR(255),
      error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    ALTER TABLE scheduled_job_runs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS scheduled_job_runs_retry_idx
    ON scheduled_job_runs (next_retry_at) WHERE status = 'RETRY_PENDING'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS scheduled_job_runs_retry_idx', { transaction });
  await sequelize.query('ALTER TABLE scheduled_job_runs DROP COLUMN IF EXISTS next_retry_at', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_compass_export_intents', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_compass_request_gates', { transaction });
};

module.exports = { name: '071_create_compass_request_state', up, down };
