const Shop = require('../models/shop');
const Request = require('../models/shopRegistrationRequest');
const Notification = require('../models/notification');
const User = require('../models/user');
const { canManageShop } = require('../middleware/auth');

async function listShops(req, res) {
  const filter = req.user?.role === 'ADMIN' ? {} : { approvalStatus: 'APPROVED' };
  const shops = await Shop.find(filter).populate('ownerId', 'fullName email').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: shops });
}
async function getShop(req, res) {
  const shop = await Shop.findById(req.params.id).populate('ownerId', 'fullName email');
  if (!shop) return res.status(404).json({ success: false, message: 'Không tìm thấy shop.' });
  if (shop.approvalStatus !== 'APPROVED' && req.user?.role !== 'ADMIN' && String(shop.ownerId._id) !== String(req.user?._id)) return res.status(404).json({ success: false, message: 'Không tìm thấy shop.' });
  return res.json({ success: true, data: shop });
}
async function createRequest(req, res) {
  const { shopName, description, address, phone } = req.body || {};
  if (!shopName?.trim()) return res.status(400).json({ success: false, message: 'shopName là bắt buộc.' });
  const pending = await Request.exists({ customerId: req.user._id, status: 'PENDING' });
  if (pending) return res.status(409).json({ success: false, message: 'Bạn đang có yêu cầu đăng ký chờ duyệt.' });
  const request = await Request.create({ customerId: req.user._id, shopName: shopName.trim(), description: [description, address && `Địa chỉ: ${address}`, phone && `Điện thoại: ${phone}`].filter(Boolean).join('\n') });
  const admins = await User.find({ role: 'ADMIN', accountStatus: 'ACTIVE' }).select('_id');
  if (admins.length) await Notification.insertMany(admins.map(({ _id }) => ({ receiverId: _id, title: 'Yêu cầu mở shop mới', message: shopName.trim(), type: 'SHOP_REGISTRATION' })));
  return res.status(201).json({ success: true, data: request });
}
async function listRequests(req, res) {
  const filter = req.user.role === 'ADMIN' ? {} : { customerId: req.user._id };
  const data = await Request.find(filter).populate('customerId', 'fullName email').populate('reviewedBy', 'fullName').sort({ createdAt: -1 });
  return res.json({ success: true, data });
}
async function reviewRequest(req, res) {
  const { status } = req.body || {};
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ success: false, message: 'status phải là APPROVED hoặc REJECTED.' });
  const request = await Request.findById(req.params.id);
  if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
  if (request.status !== 'PENDING') return res.status(409).json({ success: false, message: 'Yêu cầu đã được xử lý.' });
  request.status = status; request.reviewedBy = req.user._id; await request.save();
  const owner = await User.findById(request.customerId);
  if (status === 'APPROVED') {
    await Shop.create({ ownerId: request.customerId, shopName: request.shopName, address: request.description, approvalStatus: 'APPROVED' });
    if (owner && owner.role === 'CUSTOMER') { owner.role = 'SHOP_OWNER'; await owner.save(); }
  }
  await Notification.create({ receiverId: request.customerId, title: `Yêu cầu mở shop ${status === 'APPROVED' ? 'được duyệt' : 'bị từ chối'}`, message: request.shopName, type: 'SHOP_REGISTRATION' });
  return res.json({ success: true, data: request });
}
async function updateShop(req, res) {
  const allowed = ['shopName', 'address', 'logoUrl', 'phone', 'bannerUrl', 'operationStatus'];
  if (!(await canManageShop(req.user, req.params.id))) return res.status(403).json({ success: false, message: 'Bạn không quản lý shop này.' });
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  const shop = await Shop.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  return shop ? res.json({ success: true, data: shop }) : res.status(404).json({ success: false, message: 'Không tìm thấy shop.' });
}
module.exports = { listShops, getShop, createRequest, listRequests, reviewRequest, updateShop };
