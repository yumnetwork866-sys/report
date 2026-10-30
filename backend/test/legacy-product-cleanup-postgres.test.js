const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/101_remove_legacy_video_products');

test('legacy product cleanup drops retired tables and restores their schema', {
  skip: process.env.RUN_LEGACY_CLEANUP_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `legacy_product_cleanup_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const query = (sql) => sequelize.query(sql, { transaction });
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await require('../src/migrations/001_create_tables').up({ sequelize, transaction });
    await query("INSERT INTO products (name) VALUES ('Retired category')");

    await migration.up({ sequelize, transaction });
    await migration.up({ sequelize, transaction });
    const [[state]] = await query(`
      SELECT
        to_regclass('products') IS NULL AS products_removed,
        to_regclass('video_products') IS NULL AS links_removed,
        to_regclass('videos') IS NOT NULL AS videos_preserved
    `);
    assert.deepEqual(state, {
      products_removed: true,
      links_removed: true,
      videos_preserved: true,
    });

    await migration.down({ sequelize, transaction });
    const [[restored]] = await query(`
      SELECT
        to_regclass('products') IS NOT NULL AS products_restored,
        to_regclass('video_products') IS NOT NULL AS links_restored,
        (SELECT COUNT(*)::integer FROM products) AS product_count
    `);
    assert.deepEqual(restored, {
      products_restored: true,
      links_restored: true,
      product_count: 0,
    });
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
