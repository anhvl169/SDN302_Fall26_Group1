const authService = require("./auth.service.js");
const asyncHandler = require("../../common/utils/asyncHandler.js");
const { success } = require("../../common/utils/response.js");
const AppError = require("../../common/errors/AppError.js");

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    throw new AppError(400, "Email và mật khẩu là bắt buộc");
  }
  const data = await authService.login({ email: email.trim(), password });
  success(res, data, "Đăng nhập thành công");
});

module.exports = { login };
