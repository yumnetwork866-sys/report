const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/103_cleanup_legacy_booking_columns');

test('booking cleanup removes retired columns and preserves canonical cost and video data', {
  skip: process.env.RUN_LEGACY_CLEANUP_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `legacy_booking_cleanup_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const query = (sql) => sequelize.query(sql, { transaction });
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await query(`
      CREATE TABLE users (id SERIAL PRIMARY KEY);
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER REFERENCES users(id),
        booking_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total_cost NUMERIC(14, 2),
        cost_note TEXT,
        deadline DATE,
        end_date DATE,
        video_platform_id VARCHAR(255),
        video_url TEXT,
        posted_at TIMESTAMPTZ
      );
      INSERT INTO bookings (
        booking_cost, total_cost, video_platform_id, video_url, posted_at
      ) VALUES (
        125.50, NULL, 'video-1', 'https://www.tiktok.com/@creator/video/1', NOW()
      )
    `);

    await migration.up({ sequelize, transaction });
    await migration.up({ sequelize, transaction });
    const [[state]] = await query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings'
            AND column_name IN ('creator_id', 'deadline', 'end_date', 'cost_note', 'booking_cost'))::integer AS retired_columns,
        total_cost::text,
        video_platform_id,
        video_url,
        posted_at IS NOT NULL AS posted_at_preserved
      FROM bookings
    `);
    assert.deepEqual(state, {
      retired_columns: 0,
      total_cost: '125.50',
      video_platform_id: 'video-1',
      video_url: 'https://www.tiktok.com/@creator/video/1',
      posted_at_preserved: true,
    });

    await migration.down({ sequelize, transaction });
    const [[restored]] = await query(`
      SELECT booking_cost::text, creator_id, deadline, end_date, cost_note,
        video_platform_id, video_url, posted_at IS NOT NULL AS posted_at_preserved
      FROM bookings
    `);
    assert.deepEqual(restored, {
      booking_cost: '125.50',
      creator_id: null,
      deadline: null,
      end_date: null,
      cost_note: null,
      video_platform_id: 'video-1',
      video_url: 'https://www.tiktok.com/@creator/video/1',
      posted_at_preserved: true,
    });
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
