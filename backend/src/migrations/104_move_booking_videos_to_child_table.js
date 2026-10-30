const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'bookings'
          AND column_name = 'video_platform_id'
      ) THEN
        EXECUTE $sql$
          INSERT INTO booking_videos (
            booking_id, platform_video_id, video_url, creator_username, title, posted_at,
            attribution_start, attribution_end, mapping_source, status, last_synced_at,
            created_at, updated_at
          )
          SELECT
            booking.id,
            booking.video_platform_id,
            COALESCE(
              NULLIF(booking.video_url, ''),
              CASE
                WHEN NULLIF(booking.creator_username, '') IS NOT NULL
                THEN 'https://www.tiktok.com/@'
                  || TRIM(LEADING '@' FROM booking.creator_username)
                  || '/video/' || booking.video_platform_id
                ELSE NULL
              END
            ),
            booking.creator_username,
            COALESCE(NULLIF(booking.evaluation_snapshot->'video_match'->>'title', ''), 'TikTok video'),
            booking.posted_at,
            COALESCE(booking.posted_at::date, booking.start_date, booking.created_at::date, CURRENT_DATE),
            COALESCE(booking.posted_at::date, booking.start_date, booking.created_at::date, CURRENT_DATE) + 30,
            COALESCE(NULLIF(booking.evaluation_snapshot->'video_match'->>'source', ''), 'LEGACY'),
            CASE
              WHEN COALESCE(booking.posted_at::date, booking.start_date, booking.created_at::date, CURRENT_DATE) + 30 < CURRENT_DATE
              THEN 'FINALIZED'
              ELSE 'COLLECTING'
            END,
            CASE
              WHEN NULLIF(booking.evaluation_snapshot->'video_match'->>'matched_at', '') IS NOT NULL
              THEN (booking.evaluation_snapshot->'video_match'->>'matched_at')::timestamptz
              ELSE NULL
            END,
            COALESCE(booking.created_at, NOW()),
            COALESCE(booking.updated_at, NOW())
          FROM bookings booking
          WHERE NULLIF(booking.video_platform_id, '') IS NOT NULL
          ON CONFLICT (booking_id, platform_video_id) DO NOTHING
        $sql$;

        IF EXISTS (
          SELECT 1
          FROM bookings booking
          WHERE NULLIF(booking.video_platform_id, '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM booking_videos video
              WHERE video.booking_id = booking.id
                AND video.platform_video_id = booking.video_platform_id
            )
        ) THEN
          RAISE EXCEPTION 'Cannot remove legacy booking video columns: unmatched videos remain';
        END IF;
      END IF;
    END $$;

    ALTER TABLE bookings
      DROP COLUMN IF EXISTS video_platform_id,
      DROP COLUMN IF EXISTS video_url,
      DROP COLUMN IF EXISTS posted_at
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS video_platform_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS video_url TEXT,
      ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

    UPDATE bookings booking
    SET
      video_platform_id = video.platform_video_id,
      video_url = video.video_url,
      posted_at = video.posted_at
    FROM (
      SELECT DISTINCT ON (booking_id)
        booking_id, platform_video_id, video_url, posted_at
      FROM booking_videos
      ORDER BY booking_id, posted_at ASC NULLS LAST, id ASC
    ) video
    WHERE video.booking_id = booking.id
      AND booking.video_platform_id IS NULL
  `, { transaction });
};

module.exports = { name: '104_move_booking_videos_to_child_table', up, down };
