const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS scheduled_run_events_started_at_idx
    ON scheduled_job_run_events (started_at);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS scheduled_run_events_started_at_idx;', { transaction });
};

module.exports = { name: '108_add_scheduled_run_events_started_at_index', up, down };
