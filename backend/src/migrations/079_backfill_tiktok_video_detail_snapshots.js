const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO tiktok_video_detail_snapshots (
      shop_id, video_id, metric_window, start_date, end_date,
      views, likes, comments, shares, raw_metrics,
      synced_at, last_attempted_at, last_error
    )
    SELECT DISTINCT ON (snapshot.shop_id, snapshot.video_id)
      snapshot.shop_id,
      snapshot.video_id,
      'PAST_30_DAYS',
      export.start_date,
      export.end_date,
      snapshot.video_views,
      snapshot.likes,
      snapshot.comments,
      snapshot.shares,
      snapshot.raw_metrics->'detail',
      snapshot.synced_at,
      snapshot.synced_at,
      NULL
    FROM tiktok_video_performance_snapshots snapshot
    JOIN tiktok_creator_performance_exports export ON export.id = snapshot.export_id
    WHERE snapshot.raw_metrics->'detail' IS NOT NULL
      AND export.end_date - export.start_date = 30
    ORDER BY snapshot.shop_id, snapshot.video_id, snapshot.synced_at DESC, snapshot.id DESC
    ON CONFLICT (shop_id, video_id, metric_window) DO NOTHING
  `, { transaction });
};

const down = async () => {
  // Historical detail rows are valid shared snapshots, so rollback keeps them.
};

module.exports = { name: '079_backfill_tiktok_video_detail_snapshots', up, down };
