const shopService = require("./shop.service.js");
const asyncHandler = require("../../common/utils/asyncHandler.js");
const { success, paginated } = require("../../common/utils/response.js");

// GET /api/shops/:id
const getShopPage = asyncHandler(async (req, res) => {
  const data = await shopService.getShopPage(req.params.id);
  success(res, data);
});

// GET /api/shops/:id/categories
const getShopCategories = asyncHandler(async (req, res) => {
  const categories = await shopService.getShopCategories(req.params.id);
  success(res, categories);
});


const loadOwnedShopById = asyncHandler(async (req, res, next) => {
  const { shopId } = req.params;

  if (!mongoose.isObjectIdOrHexString(shopId)) {
    throw new AppError(400, "shopId không hợp lệ");
  }

  const shop = await Shop.findOne({
    _id: shopId,
    ownerId: req.user._id,
  });

  if (!shop) {
    throw new AppError(
      404,
      "Không tìm thấy shop thuộc quyền quản lý của bạn",
    );
  }

  req.shop = shop;
  next();
});
// UC12: POST /api/shop-registration-requests
const registrationRequest = asyncHandler(async (req, res) => {
  const data = await shopService.registrationRequest(
    req.user._id,
    req.body,
  );

  success(res, data, "Đã gửi yêu cầu mở shop", 201);
});

// UC13: GET /api/admin/shop-registration-requests
const getRegistrationRequest = asyncHandler(async (req, res) => {
  const { items, pagination } =
    await shopService.getRegistrationRequest(req.query);

  paginated(res, items, pagination);
});

// UC14: PATCH /api/admin/shop-registration-requests/:requestId/approve
const approveRegisterRequest = asyncHandler(async (req, res) => {
  const data = await shopService.approveRegisterRequest(
    req.params.requestId,
    req.user._id,
  );

  success(res, data, "Đã duyệt yêu cầu mở shop");
});

// UC15: PATCH /api/admin/shop-registration-requests/:requestId/reject
const rejectRegisterRequest = asyncHandler(async (req, res) => {
  const data = await shopService.rejectRegisterRequest(
    req.params.requestId,
    req.user._id,
    req.body,
  );

  success(res, data, "Đã từ chối yêu cầu mở shop");
});

// UC16: PATCH /api/shops/:shopId
const updateShopDetail = asyncHandler(async (req, res) => {
  const data = await shopService.updateShopDetail(
    req.params.shopId,
    req.user._id,
    req.body,
  );

  success(res, data, "Đã cập nhật thông tin shop");
});

// UC17: PATCH /api/shops/:shopId/operation-status
const closeOrOpenShop = asyncHandler(async (req, res) => {
  const data = await shopService.closeOrOpenShop(
    req.params.shopId,
    req.user._id,
    req.body,
  );

  success(res, data, "Đã cập nhật trạng thái hoạt động");
});

// UC18: GET /api/shops/:shopId/staff
const viewShopStaff = asyncHandler(async (req, res) => {
  const { items, pagination } = await shopService.viewShopStaff(
    req.params.shopId,
    req.user._id,
    req.query,
  );

  paginated(res, items, pagination);
});

// UC18: POST /api/shops/:shopId/staff
const addShopStaff = asyncHandler(async (req, res) => {
  const data = await shopService.addShopStaff(
    req.params.shopId,
    req.user._id,
    req.body,
  );

  success(res, data, "Đã thêm nhân viên", 201);
});

// UC18: PATCH /api/shops/:shopId/staff/:staffId
const updateShopStaff = asyncHandler(async (req, res) => {
  const data = await shopService.updateShopStaff(
    req.params.shopId,
    req.params.staffId,
    req.user._id,
    req.body,
  );

  success(res, data, "Đã cập nhật nhiệm vụ nhân viên");
});

// UC18: DELETE /api/shops/:shopId/staff/:staffId
const deleteShopStaff = asyncHandler(async (req, res) => {
  const data = await shopService.deleteShopStaff(
    req.params.shopId,
    req.params.staffId,
    req.user._id,
  );

  success(res, data, "Đã xóa nhân viên khỏi shop");
});

// UC19: GET /api/admin/shops
const getShops = asyncHandler(async (req, res) => {
  const { items, pagination } = await shopService.getShops(req.query);

  paginated(res, items, pagination);
});

// UC19: PATCH /api/admin/shops/:shopId/approval-status
const lockOrUnlockShop = asyncHandler(async (req, res) => {
  const data = await shopService.lockOrUnlockShop(
    req.params.shopId,
    req.body,
  );

  success(res, data, "Đã cập nhật trạng thái kiểm duyệt shop");
});

// UC20: GET /api/admin/dashboard
const shopSystemReport = asyncHandler(async (req, res) => {
  const data = await shopService.shopSystemReport(req.query);

  success(res, data);
});

module.exports = {
  getShopPage, getShopCategories,
  registrationRequest,
  getRegistrationRequest,
  approveRegisterRequest,
  rejectRegisterRequest,
  updateShopDetail,
  closeOrOpenShop,
  viewShopStaff,
  addShopStaff,
  updateShopStaff,
  deleteShopStaff,
  getShops,
  lockOrUnlockShop,
  shopSystemReport,
  loadOwnedShopById
};
