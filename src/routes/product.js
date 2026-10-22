const express = require("express");
const c = require('../controllers/product');
const { auth } = require('../middleware/auth');
const wrap = require('../middleware/async');

const productRouter = express.Router();

// Products
productRouter.get("/products", wrap(c.getProducts));
productRouter.get("/products/:id", wrap(c.getProductById));
productRouter.post('/products', auth, wrap(c.createProduct));
productRouter.put('/products/:id', auth, wrap(c.updateProduct));
productRouter.patch('/products/:id', auth, wrap(c.updateProduct));
productRouter.delete('/products/:id', auth, wrap(c.deleteProduct));
productRouter.post('/products/:id/stock', auth, wrap(c.adjustStock));
productRouter.get('/products/:id/stock-transactions', auth, wrap(c.getStockHistory));

module.exports = productRouter;
