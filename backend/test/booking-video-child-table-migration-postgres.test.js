const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const migration = require('../src/migrations/104_move_booking_videos_to_child_table');

test('booking video migration backfills every legacy video before removing parent columns', {
  skip: process.env.RUN_LEGACY_CLEANUP_DB_TESTS !== '1',
}, async () => {
  const sequelize = require('../src/db/config');
  const schema = `booking_video_child_test_${randomBytes(8).toString('hex')}`;
  const transaction = await sequelize.transaction();
  const query = (sql) => sequelize.query(sql, { transaction });
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        creator_username VARCHAR(255),
        evaluation_snapshot JSONB,
        start_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        video_platform_id VARCHAR(255),
        video_url TEXT,
        posted_at TIMESTAMPTZ
      );
      CREATE TABLE booking_videos (
        id BIGSERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        platform_video_id VARCHAR(64) NOT NULL,
        video_url TEXT,
        creator_username VARCHAR(255),
        title TEXT,
        posted_at TIMESTAMPTZ,
        attribution_start DATE NOT NULL,
        attribution_end DATE NOT NULL,
        mapping_source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_URL',
        status VARCHAR(32) NOT NULL DEFAULT 'COLLECTING',
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (booking_id, platform_video_id)
      );
      INSERT INTO bookings (
        creator_username, start_date, video_platform_id, video_url, posted_at
      ) VALUES
        ('creator.one', '2026-09-01', 'video-1', 'https://www.tiktok.com/@creator.one/video/video-1', '2026-09-05T00:00:00Z'),
        ('creator.two', '2026-09-02', 'video-2', NULL, '2026-09-06T00:00:00Z');
      INSERT INTO booking_videos (
        booking_id, platform_video_id, creator_username, attribution_start, attribution_end
      ) VALUES (1, 'video-1', 'creator.one', '2026-09-05', '2026-10-05')
    `);

    await migration.up({ sequelize, transaction });
    await migration.up({ sequelize, transaction });
    const [[state]] = await query(`
      SELECT
        (SELECT COUNT(*)::integer FROM booking_videos) AS video_count,
        (SELECT COUNT(*)::integer FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings'
            AND column_name IN ('video_platform_id', 'video_url', 'posted_at')) AS legacy_columns,
        (SELECT video_url FROM booking_videos WHERE platform_video_id = 'video-2') AS rebuilt_url
    `);
    assert.deepEqual(state, {
      video_count: 2,
      legacy_columns: 0,
      rebuilt_url: 'https://www.tiktok.com/@creator.two/video/video-2',
    });

    await migration.down({ sequelize, transaction });
    const [restored] = await query(`
      SELECT id, video_platform_id, video_url, posted_at IS NOT NULL AS has_posted_at
      FROM bookings ORDER BY id
    `);
    assert.deepEqual(restored, [
      { id: 1, video_platform_id: 'video-1', video_url: null, has_posted_at: false },
      { id: 2, video_platform_id: 'video-2', video_url: 'https://www.tiktok.com/@creator.two/video/video-2', has_posted_at: true },
    ]);
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
