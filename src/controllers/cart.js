const Cart = require('../models/cart');
const Product = require('../models/product');
async function getCart(req, res) {
  const cart = await Cart.findOne({ customerId: req.user._id }).populate({ path: 'items.productId', populate: [{ path: 'shopId', select: 'shopName approvalStatus' }, { path: 'categoryId', select: 'categoryName' }] });
  return res.json({ success: true, data: cart || { customerId: req.user._id, items: [] } });
}
async function addItem(req, res) {
  const { productId, quantity = 1 } = req.body || {};
  const amount = Number(quantity);
  if (!productId || !Number.isInteger(amount) || amount < 1) return res.status(400).json({ success: false, message: 'productId và quantity nguyên dương là bắt buộc.' });
  const product = await Product.findById(productId).populate('shopId', 'approvalStatus');
  if (!product || product.productStatus !== 'AVAILABLE' || product.shopId?.approvalStatus !== 'APPROVED') return res.status(404).json({ success: false, message: 'Sản phẩm không còn bán.' });
  let cart = await Cart.findOne({ customerId: req.user._id });
  if (!cart) cart = new Cart({ customerId: req.user._id, items: [] });
  const item = cart.items.find((entry) => String(entry.productId) === String(productId));
  const newQuantity = amount + (item?.quantity || 0);
  if (newQuantity > product.stockQuantity) return res.status(409).json({ success: false, message: 'Số lượng vượt tồn kho.' });
  if (item) item.quantity = newQuantity; else cart.items.push({ productId, quantity: amount });
  await cart.save();
  return res.status(201).json({ success: true, data: cart });
}
async function updateItem(req, res) {
  const quantity = Number(req.body?.quantity);
  const cart = await Cart.findOne({ customerId: req.user._id });
  const item = cart?.items.find((entry) => String(entry.productId) === req.params.productId);
  if (!item) return res.status(404).json({ success: false, message: 'Sản phẩm không có trong giỏ.' });
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ success: false, message: 'quantity phải là số nguyên dương.' });
  const product = await Product.findById(item.productId);
  if (!product || quantity > product.stockQuantity) return res.status(409).json({ success: false, message: 'Số lượng vượt tồn kho.' });
  item.quantity = quantity; await cart.save(); return res.json({ success: true, data: cart });
}
async function removeItem(req, res) {
  const cart = await Cart.findOne({ customerId: req.user._id });
  if (!cart) return res.status(404).json({ success: false, message: 'Giỏ hàng trống.' });
  cart.items = cart.items.filter((entry) => String(entry.productId) !== req.params.productId);
  await cart.save(); return res.json({ success: true, data: cart });
}
async function clearCart(req, res) { await Cart.findOneAndUpdate({ customerId: req.user._id }, { $set: { items: [] } }, { upsert: true }); return res.json({ success: true, message: 'Đã xóa giỏ hàng.' }); }
module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
