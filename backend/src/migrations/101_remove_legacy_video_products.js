const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP TABLE IF EXISTS video_products, products RESTRICT
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  // Rollback restores the retired schema only. Any deleted rows must be
  // recovered from the backup created by the migration runner.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS video_products (
      video_id INTEGER NOT NULL REFERENCES videos(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      PRIMARY KEY (video_id, product_id)
    )
  `, { transaction });
};

module.exports = { name: '101_remove_legacy_video_products', up, down };
