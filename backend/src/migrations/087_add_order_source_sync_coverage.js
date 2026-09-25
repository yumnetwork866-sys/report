const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_affiliate_order_sync_days
    ADD COLUMN IF NOT EXISTS affiliate_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS shop_order_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS affiliate_order_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shop_order_count INTEGER NOT NULL DEFAULT 0;
  `, { transaction });

  // Existing coverage was produced by the Affiliate Orders sync. Keep that
  // coverage, but leave Shop Orders uncovered so seller.order.info performs a
  // one-time historical backfill instead of treating those days as complete.
  await sequelize.query(`
    UPDATE tiktok_affiliate_order_sync_days
    SET affiliate_synced_at = COALESCE(affiliate_synced_at, synced_at),
        affiliate_order_count = CASE
          WHEN affiliate_order_count = 0 THEN order_count
          ELSE affiliate_order_count
        END
    WHERE affiliate_synced_at IS NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_affiliate_order_sync_days
    DROP COLUMN IF EXISTS shop_order_count,
    DROP COLUMN IF EXISTS affiliate_order_count,
    DROP COLUMN IF EXISTS shop_order_synced_at,
    DROP COLUMN IF EXISTS affiliate_synced_at;
  `, { transaction });
};

module.exports = { name: '087_add_order_source_sync_coverage', up, down };
