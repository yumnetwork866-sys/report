const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE shop_videos
      ADD COLUMN IF NOT EXISTS latest_gross_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS latest_orders INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS latest_currency VARCHAR(16) DEFAULT 'MYR',
      ADD COLUMN IF NOT EXISTS latest_synced_at TIMESTAMPTZ;
  `, { transaction });

  await sequelize.query(`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (shop_video_id)
        shop_video_id,
        gross_gmv,
        orders,
        currency,
        synced_at
      FROM shop_video_performance_snapshots
      ORDER BY shop_video_id, synced_at DESC NULLS LAST, id DESC
    )
    UPDATE shop_videos sv
    SET
      latest_gross_gmv = COALESCE(ls.gross_gmv, 0),
      latest_orders = COALESCE(ls.orders, 0),
      latest_currency = COALESCE(ls.currency, 'MYR'),
      latest_synced_at = ls.synced_at
    FROM latest_snapshots ls
    WHERE sv.id = ls.shop_video_id;
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS shop_videos_latest_performance_idx
    ON shop_videos (platform_video_id, latest_synced_at DESC NULLS LAST, id DESC)
    INCLUDE (latest_gross_gmv, latest_orders, latest_currency);
  `, { transaction });

  await sequelize.query(`
    CREATE OR REPLACE VIEW v_latest_shop_video_performance AS
    SELECT DISTINCT ON (shop_video.platform_video_id)
      shop_video.platform_video_id,
      shop_video.id AS shop_video_id,
      shop_video.latest_gross_gmv AS gross_gmv,
      shop_video.latest_orders AS orders,
      shop_video.latest_currency AS currency,
      shop_video.latest_synced_at AS synced_at
    FROM shop_videos shop_video
    ORDER BY shop_video.platform_video_id, shop_video.latest_synced_at DESC NULLS LAST, shop_video.id DESC;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE OR REPLACE VIEW v_latest_shop_video_performance AS
    SELECT DISTINCT ON (shop_video.platform_video_id)
      shop_video.platform_video_id,
      shop_video.id AS shop_video_id,
      snapshot.gross_gmv,
      snapshot.orders,
      snapshot.currency,
      snapshot.synced_at
    FROM shop_videos shop_video
    JOIN shop_video_performance_snapshots snapshot
      ON snapshot.shop_video_id = shop_video.id
    ORDER BY shop_video.platform_video_id, snapshot.synced_at DESC NULLS LAST, snapshot.id DESC;
  `, { transaction });

  await sequelize.query('DROP INDEX IF EXISTS shop_videos_latest_performance_idx;', { transaction });

  await sequelize.query(`
    ALTER TABLE shop_videos
      DROP COLUMN IF EXISTS latest_gross_gmv,
      DROP COLUMN IF EXISTS latest_orders,
      DROP COLUMN IF EXISTS latest_currency,
      DROP COLUMN IF EXISTS latest_synced_at;
  `, { transaction });
};

module.exports = { name: '106_denormalize_latest_shop_video_performance', up, down };
