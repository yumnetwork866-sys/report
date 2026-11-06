const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE tiktok_affiliate_order_skus
    SET
      content_type = 'LIVE',
      content_id = COALESCE(NULLIF(raw_data->>'room_id', ''), NULLIF(raw_data->'raw_data'->>'room_id', ''))
    WHERE content_type = 'DIRECT'
      AND (
        (raw_data->>'room_id') IS NOT NULL AND (raw_data->>'room_id') != ''
        OR (raw_data->'raw_data'->>'room_id') IS NOT NULL AND (raw_data->'raw_data'->>'room_id') != ''
      );
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE tiktok_affiliate_order_skus
    SET
      content_type = 'DIRECT',
      content_id = NULL
    WHERE content_type = 'LIVE'
      AND creator_username IS NULL
      AND (
        (raw_data->>'room_id') IS NOT NULL AND (raw_data->>'room_id') != ''
        OR (raw_data->'raw_data'->>'room_id') IS NOT NULL AND (raw_data->'raw_data'->>'room_id') != ''
      );
  `, { transaction });
};

module.exports = { name: '115_backfill_live_orders_from_room_id', up, down };

