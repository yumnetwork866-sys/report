const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (
      job_key, name, description, enabled, timezone, run_times, created_at, updated_at
    )
    VALUES (
      'currency_exchange_rates',
      'BNM Exchange Rates',
      'Sync USD/MYR/VND exchange rates from Bank Negara Malaysia across official market sessions (09:00, 12:00, 17:00).',
      true,
      'Asia/Ho_Chi_Minh',
      '["08:15", "11:15", "16:15"]'::jsonb,
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
    DELETE FROM scheduled_jobs WHERE job_key = 'currency_exchange_rates';
  `, { transaction });
};

module.exports = {
  name: '126_add_currency_exchange_rates_scheduled_job',
  up,
  down,
};

