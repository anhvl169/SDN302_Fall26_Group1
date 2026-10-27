const express = require("express");
const shopController = require("./shop.controller.js");

const shopRouter = express.Router();
const {
    role,
} = require("../../common/middlewares/role.js");
const customerOnly = role("CUSTOMER");
const adminOnly = role("ADMIN");
const ownerOnly = [role("SHOP_OWNER"), shopController.loadOwnedShopById];
// Guest / Customer - UC28
shopRouter.get("/shops/:id", shopController.getShopPage);
shopRouter.get("/shops/:id/categories", shopController.getShopCategories);

// UC12: Gửi yêu cầu mở shop
shopRouter.post(
    "/shop-registration-requests",
    customerOnly,
    shopController.registrationRequest,
);

// UC13: Xem danh sách yêu cầu mở shop
// Query: status, page, limit
shopRouter.get(
    "/admin/shop-registration-requests",
    adminOnly,
    shopController.getRegistrationRequest,
);

// UC14: Duyệt yêu cầu mở shop
shopRouter.patch(
    "/admin/shop-registration-requests/:requestId/approve",
    adminOnly,
    shopController.approveRegisterRequest,
);

// UC15: Từ chối yêu cầu mở shop
shopRouter.patch(
    "/admin/shop-registration-requests/:requestId/reject",
    adminOnly,
    shopController.rejectRegisterRequest,
);

// UC16: Cập nhật thông tin shop
shopRouter.patch(
    "/shops/:shopId",
    ownerOnly,
    shopController.updateShopDetail,
);

// UC17: Mở / đóng shop
shopRouter.patch(
    "/shops/:shopId/operation-status",
    ownerOnly,
    shopController.closeOrOpenShop,
);

// UC18: Xem danh sách nhân viên của shop
shopRouter.get(
    "/shops/:shopId/staff",
    ownerOnly,
    shopController.viewShopStaff,
);

// UC18: Thêm nhân viên bằng email
shopRouter.post(
    "/shops/:shopId/staff",
    ownerOnly,
    shopController.addShopStaff,
);

// UC18: Xóa nhân viên khỏi shop
shopRouter.delete(
    "/shops/:shopId/staff/:staffId",
    ownerOnly,
    shopController.deleteShopStaff,
);

// UC19: Xem danh sách shop
shopRouter.get(
    "/admin/shops",
    adminOnly,
    shopController.getShops,
);

// UC19: Khóa / mở lại shop
shopRouter.patch(
    "/admin/shops/:shopId/approval-status",
    adminOnly,
    shopController.lockOrUnlockShop,
);

// UC20: Thống kê hệ thống
// Query: year
shopRouter.get(
    "/admin/dashboard",
    adminOnly,
    shopController.shopSystemReport,
);

module.exports = shopRouter;
