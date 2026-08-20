const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const farmerController = require("../controllers/farmerController");

router.get(
    "/me",
    authenticateToken,
    farmerController.getMyProfile
);

router.post("/register", farmerController.registerFarmer);
router.post("/login", farmerController.loginFarmer);

module.exports = router;