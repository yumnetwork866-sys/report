const { Op } = require('sequelize');
const { TikTokShopProduct, sequelize } = require('../models');

const normalizedProduct = (product = {}) => {
  const id = String(product.id || product.product_id || '').trim().slice(0, 128);
  if (!id) return null;
  const title = String(product.title || product.name || product.product_name || '').trim() || null;
  const imageUrl = String(
    product.main_image_url
    || product.thumbnail_url
    || product.thumbnailUrl
    || product.image_url
    || product.imageUrl
    || product.main_images?.[0]?.urls?.[0]
    || product.main_images?.[0]?.url
    || product.image?.url
    || product.images?.[0]?.url
    || '',
  ).trim() || null;
  return { id, title, image_url: imageUrl, raw_data: product };
};
const productView = (row = {}) => {
  const raw = row.raw_data || row;
  const normalized = normalizedProduct({
    ...raw,
    id: row.product_id || raw.id,
    title: row.title || raw.title,
    image_url: row.image_url || raw.image_url,
  });
  if (!normalized) return null;
  const { id, title, image_url: imageUrl } = normalized;
  return {
    ...raw,
    id,
    product_id: id,
    title,
    name: title,
    image_url: imageUrl,
    main_image_url: imageUrl,
    status: raw.status || raw.product_status || raw.audit?.status || null,
    product_url: raw.product_url || raw.url || raw.share_url
      || `https://shop.tiktok.com/view/product/${encodeURIComponent(id)}`,
  };
};

const skuView = (product = {}, skuId) => {
  const id = String(skuId || '').trim();
  const sku = id && (Array.isArray(product.skus) ? product.skus : [])
    .find((candidate) => String(candidate?.id || candidate?.sku_id || '') === id);
  if (!sku) return null;
  const variant = (Array.isArray(sku.sales_attributes) ? sku.sales_attributes : [])
    .map((attribute) => attribute?.value_name || attribute?.name || attribute?.value)
    .filter(Boolean)
    .join(' / ');
  return {
    ...sku,
    id,
    sku_id: id,
    seller_sku: sku.seller_sku || sku.external_sku_id || null,
    sku_name: sku.sku_name || sku.variant_name || variant || null,
    image_url: normalizedProduct({ id, ...sku })?.image_url || null,
  };
};


const upsertShopProducts = async (shopId, products = [], { transaction } = {}) => {
  if (!sequelize?.query || !shopId) return 0;
  const byId = new Map();
  for (const product of products.map(normalizedProduct).filter(Boolean)) {
    const existing = byId.get(product.id);
    byId.set(product.id, existing ? {
      ...product,
      title: product.title || existing.title,
      image_url: product.image_url || existing.image_url,
    } : product);
  }
  const normalized = [...byId.values()];
  if (!normalized.length) return 0;
  await sequelize.query(`
    INSERT INTO tiktok_shop_products (shop_id, product_id, title, image_url, raw_data, updated_at)
    SELECT :shopId, source.id, source.title, source.image_url, source.raw_data, NOW()
    FROM jsonb_to_recordset(CAST(:products AS JSONB))
      AS source(id TEXT, title TEXT, image_url TEXT, raw_data JSONB)
    ON CONFLICT (shop_id, product_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, tiktok_shop_products.title),
      image_url = COALESCE(EXCLUDED.image_url, tiktok_shop_products.image_url),
      raw_data = CASE
        WHEN EXCLUDED.raw_data = '{}'::jsonb THEN tiktok_shop_products.raw_data
        ELSE EXCLUDED.raw_data
      END,
      updated_at = NOW()
  `, {
    replacements: { shopId, products: JSON.stringify(normalized) },
    transaction,
  });
  return normalized.length;
};

const loadShopProducts = async (shopIds, productIds) => {
  if (!TikTokShopProduct?.findAll) return [];
  const shops = [...new Set((shopIds || []).map(Number).filter(Number.isInteger))];
  const products = [...new Set((productIds || []).map(String).filter(Boolean))];
  if (!shops.length || !products.length) return [];
  return TikTokShopProduct.findAll({
    where: { shop_id: { [Op.in]: shops }, product_id: { [Op.in]: products } },
    raw: true,
  });
};

module.exports = {
  loadShopProducts,
  productView,
  skuView,
  upsertShopProducts,
  __test: { normalizedProduct },
};
