const { sequelize } = require('../models');
const { checkRedisHealth, closeRedis } = require('../lib/redis');

async function main() {
  try {
    const [rows] = await sequelize.query(`
      select
        current_database() as database,
        current_user as "user",
        has_schema_privilege(current_user, 'public', 'USAGE') as public_usage,
        has_schema_privilege(current_user, 'public', 'CREATE') as public_create
    `);
    console.log('PostgreSQL:', rows[0]);

    const redisOk = await checkRedisHealth();
    console.log('Redis Health:', redisOk ? 'CONNECTED (PONG)' : 'FAILED / UNREACHABLE');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
    await closeRedis();
  }
}

main();
