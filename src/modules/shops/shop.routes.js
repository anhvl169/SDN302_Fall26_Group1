const express = require("express");
const shopController = require("./shop.controller.js");

const shopRouter = express.Router();
const {
    role,
} = require("../../common/middlewares/role.js");
const customerOnly = role("CUSTOMER", "ADMIN", "SHOP_OWNER");
const adminOnly = role("CUSTOMER", "ADMIN", "SHOP_OWNER");
const ownerOnly = [role("CUSTOMER", "ADMIN", "SHOP_OWNER"), shopController.loadOwnedShopById];
// Guest / Customer - UC28
shopRouter.get("/shops/:id", shopController.getShopPage);
shopRouter.get("/shops/:id/categories", shopController.getShopCategories);

module.exports = shopRouter;
