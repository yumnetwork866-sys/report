const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS order_product_categories (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS order_product_categories_shop_name_idx
    ON order_product_categories (shop_id, LOWER(name))
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS order_product_category_items (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES order_product_categories(id) ON DELETE CASCADE,
      product_id VARCHAR(128) NOT NULL,
      title TEXT,
      image_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, product_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS order_product_category_items_category_idx
    ON order_product_category_items (category_id, product_id)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS order_product_category_items', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS order_product_categories', { transaction });
};

module.exports = { name: '060_create_order_product_categories', up, down };
