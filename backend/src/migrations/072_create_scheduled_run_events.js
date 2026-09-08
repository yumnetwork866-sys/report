const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS scheduled_job_run_events (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES scheduled_job_runs(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    shop_id INTEGER,
    shop_name VARCHAR(255),
    channel_id INTEGER,
    module_type VARCHAR(32),
    window_type VARCHAR(32),
    end_day INTEGER,
    attempt INTEGER,
    task_id VARCHAR(255),
    method VARCHAR(12),
    endpoint TEXT,
    http_status INTEGER,
    tiktok_code VARCHAR(64),
    request_id VARCHAR(255),
    retry_after VARCHAR(255),
    next_retry_at TIMESTAMPTZ,
    message TEXT,
    request_data JSONB,
    response_data JSONB,
    response_headers JSONB,
    payload_truncated BOOLEAN NOT NULL DEFAULT FALSE
  )`, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS scheduled_run_events_run_idx ON scheduled_job_run_events (run_id, id DESC)', { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS scheduled_run_events_request_idx ON scheduled_job_run_events (run_id, request_id)', { transaction });
};
const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS scheduled_job_run_events', { transaction });
};
module.exports = { name: '072_create_scheduled_run_events', up, down };
