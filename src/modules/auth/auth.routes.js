const express = require("express");
const authController = require("./auth.controller.js");

const authRouter = express.Router();

// Public - UC02
authRouter.post("/auth/login", authController.login);

module.exports = authRouter;
