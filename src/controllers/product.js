const mongoose = require('mongoose');
const Product = require('../models/product');
const Shop = require('../models/shop');
const Category = require('../models/category');
const StockTransaction = require('../models/stockTransaction');
const { canManageShop } = require('../middleware/auth');

async function getProducts(req, res) {
  const filter = {};
  for (const field of ['shopId', 'categoryId']) if (req.query[field]) filter[field] = req.query[field];
  if (req.query.search) filter.productName = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (!req.user || req.user.role !== 'ADMIN') filter.productStatus = { $ne: 'HIDDEN' };
  const products = await Product.find(filter).populate('shopId', 'shopName approvalStatus').populate('categoryId', 'categoryName').sort({ createdAt: -1 });
  return res.json(products.filter((product) => product.shopId?.approvalStatus === 'APPROVED').map((product) => ({ ...product.toObject(), shopId: product.shopId?._id, shopName: product.shopId?.shopName || 'No Shop', categoryId: product.categoryId?._id, categoryName: product.categoryId?.categoryName || 'No Category' })));
}
async function getProductById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Product id không hợp lệ.' });
  const product = await Product.findById(req.params.id).populate('shopId', 'shopName approvalStatus').populate('categoryId', 'categoryName');
  if (!product || product.shopId?.approvalStatus !== 'APPROVED' || (product.productStatus === 'HIDDEN' && req.user?.role !== 'ADMIN')) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  return res.json({ success: true, data: product });
}
async function createProduct(req, res) {
  const { shopId, categoryId, productName, price, stockQuantity = 0, images = [], description, expiryDate } = req.body || {};
  if (!shopId || !categoryId || !productName?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ success: false, message: 'Cần shopId, categoryId, tên sản phẩm và giá hợp lệ.' });
  if (!(await canManageShop(req.user, shopId, ['INVENTORY_STAFF']))) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý kho của shop này.' });
  const [shop, category] = await Promise.all([Shop.findById(shopId), Category.findOne({ _id: categoryId, shopId })]);
  if (!shop || !category) return res.status(400).json({ success: false, message: 'Shop hoặc category không tồn tại trong shop đã chọn.' });
  const product = await Product.create({ shopId, categoryId, productName: productName.trim(), price: Number(price), stockQuantity: Number(stockQuantity), images, description, expiryDate, productStatus: Number(stockQuantity) > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK' });
  if (Number(stockQuantity) > 0) await StockTransaction.create({ productId: product._id, shopId, type: 'IMPORT', quantity: Number(stockQuantity), note: 'Tồn kho khởi tạo', createdBy: req.user._id });
  return res.status(201).json({ success: true, data: product });
}
async function updateProduct(req, res) {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  if (!(await canManageShop(req.user, product.shopId, ['INVENTORY_STAFF']))) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý sản phẩm này.' });
  const allowed = ['categoryId', 'productName', 'description', 'price', 'images', 'expiryDate', 'productStatus'];
  for (const key of allowed) if (Object.hasOwn(req.body || {}, key)) product[key] = req.body[key];
  if (req.body?.categoryId && !(await Category.exists({ _id: req.body.categoryId, shopId: product.shopId }))) return res.status(400).json({ success: false, message: 'Category phải thuộc cùng shop.' });
  await product.save();
  return res.json({ success: true, data: product });
}
async function deleteProduct(req, res) {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  if (!(await canManageShop(req.user, product.shopId, ['INVENTORY_STAFF']))) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý sản phẩm này.' });
  product.productStatus = 'HIDDEN'; await product.save();
  return res.json({ success: true, message: 'Đã ẩn sản phẩm.' });
}
async function adjustStock(req, res) {
  const { type, quantity, note = '' } = req.body || {};
  const amount = Number(quantity);
  if (!['IMPORT', 'EXPORT'].includes(type) || !Number.isInteger(amount) || amount < 1) return res.status(400).json({ success: false, message: 'type là IMPORT/EXPORT, quantity là số nguyên dương.' });
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  if (!(await canManageShop(req.user, product.shopId, ['INVENTORY_STAFF']))) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý kho.' });
  if (type === 'EXPORT' && amount > product.stockQuantity) return res.status(409).json({ success: false, message: 'Số lượng xuất vượt tồn kho.' });
  product.stockQuantity += type === 'IMPORT' ? amount : -amount;
  product.productStatus = product.stockQuantity > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';
  await product.save();
  const transaction = await StockTransaction.create({ productId: product._id, shopId: product.shopId, type, quantity: amount, note, createdBy: req.user._id });
  return res.status(201).json({ success: true, data: { product, transaction } });
}
async function getStockHistory(req, res) {
  const product = await Product.findById(req.params.id).select('shopId');
  if (!product) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  if (!(await canManageShop(req.user, product.shopId, ['INVENTORY_STAFF']))) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch sử kho.' });
  const data = await StockTransaction.find({ productId: product._id }).populate('createdBy', 'fullName').sort({ createdAt: -1 }).limit(100);
  return res.json({ success: true, data });
}
module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct, adjustStock, getStockHistory };
