const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../src/migrations/067_cleanup_duplicate_unique_indexes');

test('duplicate unique index cleanup is guarded and keeps canonical constraints', async () => {
  const calls = [];
  const sequelize = {
    async query(sql, options) {
      calls.push({ sql, options });
    },
  };
  const transaction = { id: 'migration-transaction' };

  await migration.up({ sequelize, transaction });

  assert.equal(migration.name, '067_cleanup_duplicate_unique_indexes');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.transaction, transaction);

  const sql = calls[0].sql;
  for (const canonicalName of [
    'users_email_key',
    'products_name_key',
    'tiktok_channels_username_key',
    'tiktok_channels_tiktok_open_id_key',
  ]) {
    assert.match(sql, new RegExp(canonicalName));
  }
  assert.match(sql, /constraint_row\.contype = 'u'/);
  assert.match(sql, /candidate_index\.indisunique/);
  assert.match(sql, /candidate_index\.indkey = canonical_constraint\.indkey/);
  assert.match(sql, /foreign key depends on it/);
  assert.match(sql, /ALTER TABLE %I DROP CONSTRAINT %I/);
  assert.match(sql, /DROP INDEX %I/);
});

test('duplicate unique index cleanup rollback is a semantic no-op', async () => {
  await migration.down();
});
