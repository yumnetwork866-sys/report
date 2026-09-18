const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE booking_video_performance_snapshots
      ADD COLUMN IF NOT EXISTS items_refunded BIGINT,
      ADD COLUMN IF NOT EXISTS estimated_commission NUMERIC(20, 4)
  `, { transaction });

  await sequelize.query(`
    WITH booking_products AS (
      SELECT b.id AS booking_id, product_id
      FROM bookings b
      CROSS JOIN LATERAL (
        SELECT value AS product_id
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(b.evaluation_snapshot->'product_ids') = 'array'
            THEN b.evaluation_snapshot->'product_ids' ELSE '[]'::jsonb END
        )
        UNION
        SELECT COALESCE(value->>'id', value->>'product_id') AS product_id
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(b.evaluation_snapshot->'products') = 'array'
            THEN b.evaluation_snapshot->'products' ELSE '[]'::jsonb END
        )
      ) selected
      WHERE product_id IS NOT NULL AND product_id <> ''
    ),
    ledger AS (
      SELECT
        snapshot.id AS snapshot_id,
        SUM(COALESCE(sku.refunded_quantity, 0))::bigint AS items_refunded,
        SUM(COALESCE(sku.refunded_quantity, 0) * COALESCE(sku.price, 0))::numeric AS refunded_gmv,
        COUNT(*) FILTER (
          WHERE TRIM(COALESCE(sku.raw_data->>'creator_commission_rate', sku.raw_data->>'commission_rate', ''))
            ~ '^-?[0-9]+([.][0-9]+)?$'
        ) AS commission_rows,
        SUM(CASE
          WHEN TRIM(COALESCE(sku.raw_data->>'creator_commission_rate', sku.raw_data->>'commission_rate', ''))
            ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN COALESCE(sku.price, 0)
            * GREATEST(COALESCE(sku.quantity, 0) - COALESCE(sku.refunded_quantity, 0), 0)
            * CASE
              WHEN TRIM(COALESCE(sku.raw_data->>'creator_commission_rate', sku.raw_data->>'commission_rate'))::numeric > 100
                THEN TRIM(COALESCE(sku.raw_data->>'creator_commission_rate', sku.raw_data->>'commission_rate'))::numeric / 10000
              ELSE TRIM(COALESCE(sku.raw_data->>'creator_commission_rate', sku.raw_data->>'commission_rate'))::numeric / 100
            END
          ELSE 0
        END)::numeric AS estimated_commission
      FROM booking_video_performance_snapshots snapshot
      JOIN booking_videos video ON video.id = snapshot.booking_video_id
      JOIN bookings booking ON booking.id = video.booking_id
      JOIN tiktok_affiliate_order_skus sku
        ON sku.shop_id = booking.target_shop_id
       AND sku.content_id = video.platform_video_id
      JOIN tiktok_affiliate_orders affiliate_order ON affiliate_order.id = sku.affiliate_order_id
      WHERE (video.attribution_start IS NULL OR affiliate_order.create_time >= video.attribution_start::timestamp)
        AND affiliate_order.create_time < (snapshot.snapshot_date + 1)::timestamp
        AND (
          NOT EXISTS (SELECT 1 FROM booking_products bp WHERE bp.booking_id = booking.id)
          OR EXISTS (
            SELECT 1 FROM booking_products bp
            WHERE bp.booking_id = booking.id AND bp.product_id = sku.product_id
          )
        )
      GROUP BY snapshot.id
    )
    UPDATE booking_video_performance_snapshots snapshot
    SET
      items_refunded = ledger.items_refunded,
      refunded_gmv = COALESCE(snapshot.refunded_gmv, ledger.refunded_gmv),
      net_gmv = CASE
        WHEN snapshot.refunded_gmv IS NULL THEN snapshot.gross_gmv - ledger.refunded_gmv
        ELSE snapshot.net_gmv
      END,
      estimated_commission = CASE WHEN ledger.commission_rows > 0 THEN ledger.estimated_commission ELSE NULL END
    FROM ledger
    WHERE snapshot.id = ledger.snapshot_id
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE booking_video_performance_snapshots
      DROP COLUMN IF EXISTS estimated_commission,
      DROP COLUMN IF EXISTS items_refunded
  `, { transaction });
};

module.exports = { name: '082_add_booking_video_refund_commission', up, down };
