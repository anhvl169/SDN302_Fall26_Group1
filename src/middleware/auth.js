const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Shop = require('../models/shop');
const ShopStaff = require('../models/shopStaff');

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fruit-fresh-course-secret');
    const user = await User.findById(payload.sub).select('-password');
    if (!user || user.accountStatus !== 'ACTIVE') return res.status(401).json({ success: false, message: 'Tài khoản không hoạt động.' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}

const roles = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
  next();
};

async function canManageShop(user, shopId, staffRoles = []) {
  if (user.role === 'ADMIN') return true;
  const shop = await Shop.findById(shopId).select('ownerId approvalStatus');
  if (!shop || shop.approvalStatus !== 'APPROVED') return false;
  if (String(shop.ownerId) === String(user._id)) return true;
  if (!staffRoles.length) return false;
  return Boolean(await ShopStaff.exists({ shopId, userId: user._id, role: { $in: staffRoles } }));
}

module.exports = { auth, roles, canManageShop };
