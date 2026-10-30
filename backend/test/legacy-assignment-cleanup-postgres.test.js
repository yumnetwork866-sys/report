const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/102_remove_legacy_video_assignments');

test('legacy assignment cleanup drops the retired table and restores its schema', {
  skip: process.env.RUN_LEGACY_CLEANUP_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `legacy_assignment_cleanup_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const query = (sql) => sequelize.query(sql, { transaction });
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await require('../src/migrations/001_create_tables').up({ sequelize, transaction });

    await migration.up({ sequelize, transaction });
    await migration.up({ sequelize, transaction });
    const [[state]] = await query(`
      SELECT
        to_regclass('video_assignments') IS NULL AS assignments_removed,
        to_regclass('videos') IS NOT NULL AS videos_preserved,
        to_regclass('users') IS NOT NULL AS users_preserved
    `);
    assert.deepEqual(state, {
      assignments_removed: true,
      videos_preserved: true,
      users_preserved: true,
    });

    await migration.down({ sequelize, transaction });
    const [[restored]] = await query(`
      SELECT
        to_regclass('video_assignments') IS NOT NULL AS assignments_restored,
        (SELECT COUNT(*)::integer FROM video_assignments) AS assignment_count
    `);
    assert.deepEqual(restored, {
      assignments_restored: true,
      assignment_count: 0,
    });
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
