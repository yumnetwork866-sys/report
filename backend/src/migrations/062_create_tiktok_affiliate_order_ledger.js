const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_affiliate_orders (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      order_id VARCHAR(64) NOT NULL,
      create_time TIMESTAMPTZ NOT NULL,
      delivery_time TIMESTAMPTZ,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, order_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_affiliate_orders_shop_created_idx
    ON tiktok_affiliate_orders (shop_id, create_time DESC)
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_affiliate_order_skus (
      id BIGSERIAL PRIMARY KEY,
      affiliate_order_id BIGINT NOT NULL REFERENCES tiktok_affiliate_orders(id) ON DELETE CASCADE,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      order_id VARCHAR(64) NOT NULL,
      sku_id VARCHAR(128) NOT NULL,
      product_id VARCHAR(128),
      product_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      refunded_quantity INTEGER NOT NULL DEFAULT 0,
      content_type VARCHAR(32),
      content_id VARCHAR(128),
      creator_username VARCHAR(255),
      price NUMERIC(20, 4),
      currency VARCHAR(16),
      settlement_status VARCHAR(64),
      fully_return BOOLEAN NOT NULL DEFAULT FALSE,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, order_id, sku_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_affiliate_order_skus_video_idx
    ON tiktok_affiliate_order_skus (content_type, content_id, affiliate_order_id)
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_affiliate_order_skus_product_idx
    ON tiktok_affiliate_order_skus (shop_id, product_id)
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_affiliate_order_sync_days (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      order_count INTEGER NOT NULL DEFAULT 0,
      sku_count INTEGER NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, metric_date)
    )
  `, { transaction });

  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_affiliate_orders',
      'TikTok Affiliate Orders',
      'Synchronize Affiliate Orders and SKU-to-content attribution into the local ledger.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["07:30"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query("DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_affiliate_orders'", { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_affiliate_order_sync_days', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_affiliate_order_skus', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_affiliate_orders', { transaction });
};

module.exports = { name: '062_create_tiktok_affiliate_order_ledger', up, down };
