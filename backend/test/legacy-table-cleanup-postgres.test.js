const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/100_remove_unused_facebook_chatbot_weekly_reports');

test('legacy cleanup preserves active tables, rejects external dependencies and restores the schema', {
  skip: process.env.RUN_LEGACY_CLEANUP_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `legacy_cleanup_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const context = { sequelize, transaction };
  const query = (sql) => sequelize.query(sql, { transaction });
  try {
    // All fixtures, including this isolated schema, disappear on rollback.
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    for (const name of [
      '001_create_tables',
      '005_add_facebook_chatbot_tables',
      '006_add_chatbot_settings',
      '009_add_facebook_page_avatar_url',
      '039_add_weekly_report_public_sharing',
    ]) {
      await require(`../src/migrations/${name}`).up(context);
    }
    const inspectSchema = async () => {
      const [columns] = await query(`
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = current_schema()
        ORDER BY table_name, ordinal_position
      `);
      const [indexes] = await query(`
        SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()
        ORDER BY indexname
      `);
      const [constraints] = await query(`
        SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE connamespace = current_schema()::regnamespace
        ORDER BY conname
      `);
      return { columns, indexes, constraints };
    };
    const originalSchema = await inspectSchema();
    await query("INSERT INTO products (name) VALUES ('Still used')");
    await query("INSERT INTO facebook_pages (id, name, access_token_encrypted) VALUES ('page', 'Retired page', 'fixture')");
    await query("INSERT INTO chatbot_messages (sender_id, page_id, direction, text) VALUES ('sender', 'page', 'in', 'fixture')");
    await query("INSERT INTO weekly_reports (week_start, week_end, generated_content) VALUES ('2026-06-22', '2026-06-28', 'fixture')");

    await query('CREATE TABLE active_dependency (page_id VARCHAR(255) REFERENCES facebook_pages(id))');
    await query('SAVEPOINT dependency_check');
    await assert.rejects(migration.up(context), (error) => error.original?.code === '2BP01');
    await query('ROLLBACK TO SAVEPOINT dependency_check');
    const [[retained]] = await query('SELECT COUNT(*)::integer AS count FROM chatbot_messages');
    assert.equal(retained.count, 1);
    await query('DROP TABLE active_dependency');

    await migration.up(context);
    await migration.up(context);
    const [remaining] = await query(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() ORDER BY table_name
    `);
    assert.deepEqual(remaining.map((row) => row.name), [
      'products', 'tiktok_channels', 'users', 'video_assignments',
      'video_daily_stats', 'video_products', 'videos',
    ]);
    const [[product]] = await query('SELECT name FROM products');
    assert.equal(product.name, 'Still used');

    await migration.down(context);
    assert.deepEqual(await inspectSchema(), originalSchema);
    const [[report]] = await query('SELECT COUNT(*)::integer AS count FROM weekly_reports');
    assert.equal(report.count, 0); // Data recovery requires the pre-migration backup.
    await migration.up(context);
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
