// Bản tạm để test API, Luồng 1 (UC02) sẽ thay bằng bản chính thức.
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../users/user.model.js");
const AppError = require("../../common/errors/AppError.js");

const publicUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  accountStatus: user.accountStatus,
});

// UC02 - đăng nhập: kiểm tra email + mật khẩu, chặn tài khoản BANNED, cấp JWT
const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, "Email hoặc mật khẩu không đúng");
  }
  if (user.accountStatus === "BANNED") {
    throw new AppError(403, "Tài khoản đã bị khóa");
  }

  // ghi cả id và sub để dùng được với middleware auth của các nhánh khác
  const token = jwt.sign(
    { id: user._id, sub: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  return { token, user: publicUser(user) };
};

module.exports = { login };
