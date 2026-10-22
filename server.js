const express = require("express");
require('dotenv').config();
const path = require("path");
const connectDB = require("./config/db");
const router = require("./src/routes/index.js");
const app = express();
connectDB();
app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", router);
app.use((error, req, res, next) => {
  console.error('API error:', error);
  if (res.headersSent) return next(error);
  return res.status(error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)
    .json({ success: false, message: error.name === 'ValidationError' || error.name === 'CastError' ? error.message : 'Lỗi máy chủ.' });
});
const PORT = process.env.PORT || 9999;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
