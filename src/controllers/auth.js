const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const publicUser = (user) => ({ _id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, accountStatus: user.accountStatus });
async function register(req, res) {
  try {
    const { fullName, email, password, phone } = req.body || {};
    if (!fullName?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, message: 'Cần họ tên, email và mật khẩu tối thiểu 8 ký tự.' });
    const user = await User.create({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password: await bcrypt.hash(password, 10), phone, role: 'CUSTOMER' });
    return res.status(201).json({ success: true, data: publicUser(user) });
  } catch (error) {
    return res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.code === 11000 ? 'Email đã được sử dụng.' : error.message });
  }
}
async function login(req, res) {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password || ''), user.password))) return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
  if (user.accountStatus !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa.' });
  const token = jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET || 'fruit-fresh-course-secret', { expiresIn: '12h' });
  return res.json({ success: true, data: { token, user: publicUser(user) } });
}
async function me(req, res) { return res.json({ success: true, data: publicUser(req.user) }); }
async function listUsers(req, res) {
  const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: users });
}
async function updateUser(req, res) {
  const { role, accountStatus } = req.body || {};
  const updates = {};
  if (role && ['ADMIN', 'SHOP_OWNER', 'STAFF', 'CUSTOMER'].includes(role)) updates.role = role;
  if (accountStatus && ['ACTIVE', 'BANNED'].includes(accountStatus)) updates.accountStatus = accountStatus;
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: 'Không có trường hợp lệ để cập nhật.' });
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
  return res.json({ success: true, data: user });
}
module.exports = { register, login, me, listUsers, updateUser };
