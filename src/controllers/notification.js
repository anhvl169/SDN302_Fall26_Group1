const Notification = require('../models/notification');
async function list(req, res) { const data = await Notification.find({ receiverId: req.user._id }).sort({ createdAt: -1 }).limit(100); return res.json({ success: true, data }); }
async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, receiverId: req.user._id }, { isRead: true }, { new: true });
  return notification ? res.json({ success: true, data: notification }) : res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
}
module.exports = { list, markRead };
