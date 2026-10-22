const Shop = require('../models/shop');
const User = require('../models/user');
const ShopStaff = require('../models/shopStaff');
const { canManageShop } = require('../middleware/auth');
async function list(req, res) {
  const shopId = req.params.shopId;
  if (!(await canManageShop(req.user, shopId))) return res.status(403).json({ success: false, message: 'Bạn không quản lý shop này.' });
  const data = await ShopStaff.find({ shopId }).populate('userId', 'fullName email role accountStatus').sort({ createdAt: -1 });
  return res.json({ success: true, data });
}
async function add(req, res) {
  const { userId, role } = req.body || {};
  if (!(await canManageShop(req.user, req.params.shopId))) return res.status(403).json({ success: false, message: 'Bạn không quản lý shop này.' });
  if (!['INVENTORY_STAFF', 'ORDER_STAFF'].includes(role)) return res.status(400).json({ success: false, message: 'role phải là INVENTORY_STAFF hoặc ORDER_STAFF.' });
  const [shop, user] = await Promise.all([Shop.findById(req.params.shopId), User.findById(userId)]);
  if (!shop || !user || user.accountStatus !== 'ACTIVE') return res.status(404).json({ success: false, message: 'Shop hoặc tài khoản đang hoạt động không tồn tại.' });
  const staff = await ShopStaff.create({ shopId: shop._id, userId: user._id, role });
  if (user.role === 'CUSTOMER') { user.role = 'STAFF'; await user.save(); }
  return res.status(201).json({ success: true, data: staff });
}
async function remove(req, res) {
  if (!(await canManageShop(req.user, req.params.shopId))) return res.status(403).json({ success: false, message: 'Bạn không quản lý shop này.' });
  const staff = await ShopStaff.findOneAndDelete({ shopId: req.params.shopId, userId: req.params.userId });
  return staff ? res.json({ success: true, message: 'Đã gỡ nhân viên khỏi shop.' }) : res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên trong shop.' });
}
module.exports = { list, add, remove };
