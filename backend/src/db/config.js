const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const poolOptions = {
  max: parsePositiveInt(process.env.DB_POOL_MAX, 20),
  min: parsePositiveInt(process.env.DB_POOL_MIN, 2),
  acquire: parsePositiveInt(process.env.DB_POOL_ACQUIRE_MS, 30000),
  idle: parsePositiveInt(process.env.DB_POOL_IDLE_MS, 10000),
};

const statementTimeoutMs = parsePositiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, 30000);

const createSequelize = () => {
  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      pool: poolOptions,
      dialectOptions: { statement_timeout: statementTimeoutMs },
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
      dialect: 'postgres',
      logging: false,
      pool: poolOptions,
      dialectOptions: { statement_timeout: statementTimeoutMs },
    },
  );
};

const sequelize = createSequelize();

if (process.env.NODE_ENV !== 'test') {
  sequelize.authenticate()
    .then(() => {
      console.log('Database connection has been established successfully.');
    })
    .catch((error) => {
      console.error('Unable to connect to the database:', error);
    });
}

module.exports = sequelize;
