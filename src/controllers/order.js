const mongoose = require('mongoose');
const Order = require('../models/order');
const Cart = require('../models/cart');
const Product = require('../models/product');
const Shop = require('../models/shop');
const StockTransaction = require('../models/stockTransaction');
const Notification = require('../models/notification');
const { canManageShop } = require('../middleware/auth');

async function checkout(req, res) {
  const { shippingAddress, paymentMethod = 'COD' } = req.body || {};
  if (!shippingAddress?.trim()) return res.status(400).json({ success: false, message: 'shippingAddress là bắt buộc.' });
  if (!['COD', 'MOCK_ONLINE'].includes(paymentMethod)) return res.status(400).json({ success: false, message: 'paymentMethod phải là COD hoặc MOCK_ONLINE.' });
  const cart = await Cart.findOne({ customerId: req.user._id });
  if (!cart?.items.length) return res.status(400).json({ success: false, message: 'Giỏ hàng đang trống.' });
  const products = await Product.find({ _id: { $in: cart.items.map((item) => item.productId) }, productStatus: 'AVAILABLE' }).populate('shopId', 'approvalStatus');
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const groups = new Map();
  for (const item of cart.items) {
    const product = productMap.get(String(item.productId));
    if (!product || product.shopId?.approvalStatus !== 'APPROVED') return res.status(409).json({ success: false, message: 'Một sản phẩm trong giỏ không còn bán.' });
    if (item.quantity > product.stockQuantity) return res.status(409).json({ success: false, message: `${product.productName} không đủ tồn kho.` });
    const key = String(product.shopId._id); if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ product, quantity: item.quantity });
  }
  const orders = [];
  for (const [shopId, entries] of groups) {
    const items = entries.map(({ product, quantity }) => ({ productId: product._id, productName: product.productName, price: product.price, quantity, subtotal: product.price * quantity }));
    orders.push(await Order.create({ customerId: req.user._id, shopId, items, shippingAddress: shippingAddress.trim(), totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0), paymentMethod, paymentStatus: 'UNPAID' }));
  }
  for (const order of orders) {
    const recipients = await Shop.findById(order.shopId).select('ownerId');
    if (recipients) await Notification.create({ receiverId: recipients.ownerId, title: 'Có đơn hàng mới', message: `Đơn ${order._id}`, type: 'ORDER' });
    for (const item of order.items) {
      const product = productMap.get(String(item.productId));
      product.stockQuantity -= item.quantity;
      if (!product.stockQuantity) product.productStatus = 'OUT_OF_STOCK';
      await product.save();
      await StockTransaction.create({ productId: product._id, shopId: order.shopId, type: 'EXPORT', quantity: item.quantity, note: `Xuất kho cho đơn ${order._id}`, createdBy: req.user._id });
    }
  }
  cart.items = []; await cart.save();
  return res.status(201).json({ success: true, message: 'Đặt hàng thành công. Nếu chọn MOCK_ONLINE, gọi pay-simulate để giả lập thanh toán.', data: orders });
}
async function listOrders(req, res) {
  const filter = {};
  if (req.user.role === 'CUSTOMER') filter.customerId = req.user._id;
  else if (req.user.role !== 'ADMIN') {
    const shops = await Shop.find({ ownerId: req.user._id }).select('_id');
    const staff = await require('../models/shopStaff').find({ userId: req.user._id }).select('shopId');
    filter.shopId = { $in: [...shops.map((item) => item._id), ...staff.map((item) => item.shopId)] };
  }
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (req.query.orderStatus) filter.orderStatus = req.query.orderStatus;
  const data = await Order.find(filter).populate('customerId', 'fullName email phone').populate('shopId', 'shopName').sort({ createdAt: -1 });
  return res.json({ success: true, data });
}
async function getOrder(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Order id không hợp lệ.' });
  const order = await Order.findById(req.params.id).populate('customerId', 'fullName email phone').populate('shopId', 'shopName');
  if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
  if (req.user.role === 'CUSTOMER' && String(order.customerId._id) !== String(req.user._id) && req.user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền xem đơn này.' });
  if (!['CUSTOMER', 'ADMIN'].includes(req.user.role) && !(await canManageShop(req.user, order.shopId._id, ['ORDER_STAFF']))) return res.status(403).json({ success: false, message: 'Không có quyền xem đơn này.' });
  return res.json({ success: true, data: order });
}
async function updateStatus(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
  const { orderStatus } = req.body || {};
  const transitions = { PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PREPARING', 'CANCELLED'], PREPARING: ['SHIPPING'], SHIPPING: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
  const customerCancel = req.user.role === 'CUSTOMER' && String(order.customerId) === String(req.user._id) && orderStatus === 'CANCELLED' && order.orderStatus === 'PENDING';
  const staffAllowed = req.user.role === 'ADMIN' || await canManageShop(req.user, order.shopId, ['ORDER_STAFF']);
  if (!customerCancel && !staffAllowed) return res.status(403).json({ success: false, message: 'Không có quyền cập nhật đơn này.' });
  if (!transitions[order.orderStatus]?.includes(orderStatus)) return res.status(409).json({ success: false, message: 'Chuyển trạng thái đơn hàng không hợp lệ.' });
  order.orderStatus = orderStatus;
  if (orderStatus === 'CANCELLED' && order.paymentStatus === 'PAID') order.paymentStatus = 'REFUNDED';
  await order.save();
  if (orderStatus === 'CANCELLED') {
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) { product.stockQuantity += item.quantity; product.productStatus = 'AVAILABLE'; await product.save(); await StockTransaction.create({ productId: product._id, shopId: order.shopId, type: 'IMPORT', quantity: item.quantity, note: `Hoàn kho đơn ${order._id}`, createdBy: req.user._id }); }
    }
  }
  await Notification.create({ receiverId: order.customerId, title: 'Cập nhật đơn hàng', message: `Đơn ${order._id}: ${orderStatus}`, type: 'ORDER' });
  return res.json({ success: true, data: order });
}
async function simulatePayment(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order || String(order.customerId) !== String(req.user._id)) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
  if (order.paymentMethod !== 'MOCK_ONLINE') return res.status(400).json({ success: false, message: 'Đơn hàng không dùng phương thức thanh toán mô phỏng.' });
  if (order.paymentStatus !== 'UNPAID') return res.status(409).json({ success: false, message: 'Đơn hàng không ở trạng thái chưa thanh toán.' });
  order.paymentStatus = 'PAID'; await order.save();
  return res.json({ success: true, message: 'Đã giả lập thanh toán thành công; không có giao dịch tiền thật.', data: order });
}
module.exports = { checkout, listOrders, getOrder, updateStatus, simulatePayment };
