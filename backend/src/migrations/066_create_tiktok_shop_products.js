const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_shop_products (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      product_id VARCHAR(128) NOT NULL,
      title TEXT,
      image_url TEXT,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, product_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_shop_products_shop_updated_idx
    ON tiktok_shop_products (shop_id, updated_at DESC)
  `, { transaction });
  await sequelize.query(`
    WITH source AS (
      SELECT
        booking.target_shop_id AS shop_id,
        product.value ->> 'id' AS product_id,
        NULLIF(COALESCE(product.value ->> 'name', product.value ->> 'title', product.value ->> 'product_name'), '') AS title,
        NULLIF(COALESCE(
          product.value ->> 'image_url', product.value ->> 'imageUrl',
          product.value ->> 'main_image_url', product.value ->> 'thumbnail_url'
        ), '') AS image_url,
        product.value AS raw_data
      FROM bookings booking
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(booking.evaluation_snapshot -> 'products') = 'array'
          THEN booking.evaluation_snapshot -> 'products' ELSE '[]'::jsonb END
      ) product(value)
      WHERE booking.target_shop_id IS NOT NULL
        AND NULLIF(product.value ->> 'id', '') IS NOT NULL
    ), deduplicated AS (
      SELECT DISTINCT ON (shop_id, product_id) *
      FROM source
      ORDER BY shop_id, product_id, (image_url IS NOT NULL) DESC
    )
    INSERT INTO tiktok_shop_products (shop_id, product_id, title, image_url, raw_data, updated_at)
    SELECT shop_id, product_id, title, image_url, raw_data, NOW()
    FROM deduplicated
    ON CONFLICT (shop_id, product_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, tiktok_shop_products.title),
      image_url = COALESCE(EXCLUDED.image_url, tiktok_shop_products.image_url),
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
  `, { transaction });
  await sequelize.query(`
    INSERT INTO tiktok_shop_products (shop_id, product_id, title, image_url, raw_data, updated_at)
    SELECT shop_id, product_id, title, image_url, '{}'::jsonb, updated_at
    FROM order_product_category_items
    ON CONFLICT (shop_id, product_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, tiktok_shop_products.title),
      image_url = COALESCE(EXCLUDED.image_url, tiktok_shop_products.image_url),
      updated_at = GREATEST(EXCLUDED.updated_at, tiktok_shop_products.updated_at)
  `, { transaction });
  await sequelize.query(`
    WITH source AS (
      SELECT
        video.shop_id,
        product.value ->> 'id' AS product_id,
        NULLIF(COALESCE(product.value ->> 'name', product.value ->> 'title'), '') AS title,
        NULLIF(COALESCE(product.value ->> 'main_image_url', product.value ->> 'thumbnail_url', product.value ->> 'image_url'), '') AS image_url,
        product.value AS raw_data
      FROM shop_videos video
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(video.raw_data -> 'products') = 'array'
          THEN video.raw_data -> 'products' ELSE '[]'::jsonb END
      ) product(value)
      WHERE NULLIF(product.value ->> 'id', '') IS NOT NULL
    ), deduplicated AS (
      SELECT DISTINCT ON (shop_id, product_id) *
      FROM source
      ORDER BY shop_id, product_id, (image_url IS NOT NULL) DESC
    )
    INSERT INTO tiktok_shop_products (shop_id, product_id, title, image_url, raw_data, updated_at)
    SELECT shop_id, product_id, title, image_url, raw_data, NOW()
    FROM deduplicated
    ON CONFLICT (shop_id, product_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, tiktok_shop_products.title),
      image_url = COALESCE(EXCLUDED.image_url, tiktok_shop_products.image_url),
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_shop_products', { transaction });
};

module.exports = { name: '066_create_tiktok_shop_products', up, down };
