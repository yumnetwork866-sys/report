const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/105_optimize_high_traffic_indexes');

const addedIndexes = [
  'idx_affiliate_order_skus_order_id',
  'idx_channel_report_revenue_video_date',
  'idx_creator_perf_snapshots_export_id',
];

const removedIndexes = [
  'booking_video_snapshots_video_date_idx',
  'idx_shop_video_snapshots_latest',
  'shop_video_snapshots_video_date_idx',
  'video_daily_stats_date_idx',
  'video_daily_stats_video_id_date',
  'video_daily_stats_video_id_date_idx',
];

test('high-traffic index migration adds lookup indexes and removes duplicate indexes', {
  skip: process.env.RUN_INDEX_OPTIMIZATION_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `index_optimization_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const query = (sql) => sequelize.query(sql, { transaction });
  const indexNames = async () => {
    const [rows] = await query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema()
      ORDER BY indexname
    `);
    return rows.map((row) => row.indexname);
  };

  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await query(`
      CREATE TABLE tiktok_creator_performance_snapshots (id SERIAL PRIMARY KEY, export_id INTEGER NOT NULL);
      CREATE TABLE channel_report_video_revenue_daily (id BIGSERIAL PRIMARY KEY, platform_video_id VARCHAR(64), metric_date DATE);
      CREATE TABLE tiktok_affiliate_order_skus (id BIGSERIAL PRIMARY KEY, affiliate_order_id BIGINT NOT NULL);
      CREATE TABLE shop_video_performance_snapshots (id BIGSERIAL PRIMARY KEY, shop_video_id BIGINT, snapshot_date DATE, synced_at TIMESTAMPTZ);
      CREATE TABLE video_daily_stats (id SERIAL PRIMARY KEY, video_id INTEGER, date DATE);
      CREATE TABLE booking_video_performance_snapshots (id BIGSERIAL PRIMARY KEY, booking_video_id BIGINT, snapshot_date DATE);

      CREATE INDEX idx_shop_video_snapshots_latest ON shop_video_performance_snapshots (shop_video_id, synced_at DESC, id DESC);
      CREATE INDEX shop_video_snapshots_video_date_idx ON shop_video_performance_snapshots (shop_video_id, snapshot_date DESC);
      CREATE INDEX video_daily_stats_video_id_date_idx ON video_daily_stats (video_id, date);
      CREATE INDEX video_daily_stats_video_id_date ON video_daily_stats (video_id, date);
      CREATE INDEX video_daily_stats_date_idx ON video_daily_stats (date);
      CREATE INDEX booking_video_snapshots_video_date_idx ON booking_video_performance_snapshots (booking_video_id, snapshot_date DESC)
    `);

    await migration.up({ sequelize, transaction });
    await migration.up({ sequelize, transaction });
    const optimized = await indexNames();
    for (const name of addedIndexes) assert.equal(optimized.includes(name), true, `${name} should exist`);
    for (const name of removedIndexes) assert.equal(optimized.includes(name), false, `${name} should be removed`);

    await migration.down({ sequelize, transaction });
    const restored = await indexNames();
    for (const name of addedIndexes) assert.equal(restored.includes(name), false, `${name} should be removed on rollback`);
    for (const name of removedIndexes) assert.equal(restored.includes(name), true, `${name} should be restored`);
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
