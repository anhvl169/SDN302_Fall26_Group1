const express = require("express");
const {
  getCategories,
  getCategoriesByShop,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.js");

const categoryRouter = express.Router();
const { auth } = require('../middleware/auth');
const wrap = require('../middleware/async');

categoryRouter.get("/categories", getCategories);
categoryRouter.get("/categories/shop/:shopId", getCategoriesByShop);
categoryRouter.get("/categories/:id", getCategoryById);
categoryRouter.post("/categories", auth, wrap(createCategory));
categoryRouter.put("/categories/:id", auth, wrap(updateCategory));
categoryRouter.patch("/categories/:id", auth, wrap(updateCategory));
categoryRouter.delete("/categories/:id", auth, wrap(deleteCategory));

module.exports = categoryRouter;
