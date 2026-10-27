const path = require('path');
const { Sequelize } = require('sequelize');
const { recordDatabaseQuery } = require('../lib/requestTelemetry');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const processRole = String(process.env.PROCESS_ROLE || 'api').toUpperCase();
const roleSetting = (name, fallback) => process.env[`${name}_${processRole}`] ?? process.env[name] ?? fallback;

const poolOptions = {
  max: parsePositiveInt(roleSetting('DB_POOL_MAX', 10), 10),
  min: parsePositiveInt(roleSetting('DB_POOL_MIN', 1), 1),
  acquire: parsePositiveInt(process.env.DB_POOL_ACQUIRE_MS, 30000),
  idle: parsePositiveInt(process.env.DB_POOL_IDLE_MS, 10000),
};

const statementTimeoutMs = parsePositiveInt(roleSetting('DB_STATEMENT_TIMEOUT_MS', 30000), 30000);

const sequelizeOptions = {
  dialect: 'postgres',
  benchmark: true,
  logging: (sql, elapsedMs) => recordDatabaseQuery(elapsedMs, sql),
  pool: poolOptions,
  dialectOptions: { statement_timeout: statementTimeoutMs },
};

const createSequelize = () => {
  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      ...sequelizeOptions,
    });
  }

  const requiredVariables = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);

  if (missingVariables.length > 0) {
    throw new Error(
      `Database configuration is missing. Set DATABASE_URL or ${missingVariables.join(', ')} in .env.`,
    );
  }

  return new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      ...sequelizeOptions,
    },
  );
};

const sequelize = createSequelize();

module.exports = sequelize;
