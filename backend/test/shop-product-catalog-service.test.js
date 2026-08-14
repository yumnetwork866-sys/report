const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('shop product catalog normalizes and persists thumbnail metadata', async (t) => {
  const calls = [];
  const modelsPath = require.resolve('../src/models');
  const servicePath = require.resolve('../src/services/shopProductCatalogService');
  const restore = mockModule(modelsPath, {
    sequelize: { query: async (sql, options) => calls.push({ sql, options }) },
    TikTokShopProduct: { findAll: async () => [] },
  });
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restore();
  });

  const { upsertShopProducts, __test: { normalizedProduct } } = require(servicePath);
  assert.deepEqual(normalizedProduct({
    id: 'product-1', name: 'Product One', main_image_url: 'https://example.test/product-1.webp',
  }), {
    id: 'product-1',
    title: 'Product One',
    image_url: 'https://example.test/product-1.webp',
    raw_data: { id: 'product-1', name: 'Product One', main_image_url: 'https://example.test/product-1.webp' },
  });

  const count = await upsertShopProducts(7, [
    { id: 'product-1', name: 'Product One', main_image_url: 'https://example.test/product-1.webp' },
    { product_id: 'product-1', title: 'Latest Product One' },
  ]);
  assert.equal(count, 1);
  assert.match(calls[0].sql, /INSERT INTO tiktok_shop_products/);
  assert.equal(calls[0].options.replacements.shopId, 7);
  const saved = JSON.parse(calls[0].options.replacements.products)[0];
  assert.equal(saved.title, 'Latest Product One');
  assert.equal(saved.image_url, 'https://example.test/product-1.webp');
});
