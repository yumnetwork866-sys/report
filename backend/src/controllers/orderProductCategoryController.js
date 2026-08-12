const {
  OrderProductCategory,
  OrderProductCategoryItem,
  TikTokShop,
} = require('../models');

const normalizedName = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
const normalizedProductId = (value) => String(value || '').trim().slice(0, 128);

const findShop = async (shopId) => TikTokShop.findByPk(shopId, { attributes: ['id'] });

const listCategories = async (req, res) => {
  try {
    if (!await findShop(req.params.shopId)) return res.status(404).json({ message: 'Shop not found' });
    const categories = await OrderProductCategory.findAll({
      where: { shop_id: req.params.shopId },
      include: [{ model: OrderProductCategoryItem, as: 'products', required: false }],
      order: [['name', 'ASC'], [{ model: OrderProductCategoryItem, as: 'products' }, 'title', 'ASC']],
    });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createCategory = async (req, res) => {
  try {
    if (!await findShop(req.params.shopId)) return res.status(404).json({ message: 'Shop not found' });
    const name = normalizedName(req.body?.name);
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const existing = await OrderProductCategory.findOne({
      where: { shop_id: req.params.shopId, name },
    });
    if (existing) return res.status(409).json({ message: 'Category already exists' });
    const category = await OrderProductCategory.create({ shop_id: req.params.shopId, name });
    return res.status(201).json({ ...category.toJSON(), products: [] });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Category already exists' });
    return res.status(500).json({ message: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const deleted = await OrderProductCategory.destroy({
      where: { id: req.params.categoryId, shop_id: req.params.shopId },
    });
    if (!deleted) return res.status(404).json({ message: 'Category not found' });
    return res.json({ message: 'Category deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const assignProduct = async (req, res) => {
  try {
    const productId = normalizedProductId(req.params.productId);
    const categoryId = Number(req.body?.category_id);
    if (!productId) return res.status(400).json({ message: 'Product ID is required' });
    if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'Category is required' });
    const category = await OrderProductCategory.findOne({
      where: { id: categoryId, shop_id: req.params.shopId },
    });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const values = {
      shop_id: req.params.shopId,
      category_id: category.id,
      product_id: productId,
      title: String(req.body?.title || '').trim() || null,
      image_url: String(req.body?.image_url || '').trim() || null,
      updated_at: new Date(),
    };
    const [item, created] = await OrderProductCategoryItem.findOrCreate({
      where: { shop_id: req.params.shopId, product_id: productId },
      defaults: values,
    });
    if (!created) await item.update(values);
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const unassignProduct = async (req, res) => {
  try {
    const deleted = await OrderProductCategoryItem.destroy({
      where: { shop_id: req.params.shopId, product_id: normalizedProductId(req.params.productId) },
    });
    if (!deleted) return res.status(404).json({ message: 'Product assignment not found' });
    return res.json({ message: 'Product removed from category' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { listCategories, createCategory, deleteCategory, assignProduct, unassignProduct };
