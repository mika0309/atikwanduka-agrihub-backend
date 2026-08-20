const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

// Public routes
router.post("/register/farmer", authController.registerFarmer);
router.post("/register/buyer", authController.registerBuyer);
router.post("/register/transporter", authController.registerTransporter);
router.post("/login", authController.login);

module.exports = router;