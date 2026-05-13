const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const subsidyController = require("../controllers/subsidyController");

router.post(
    "/assign",
    authenticateToken,
    authorizeRole("admin"),
    subsidyController.assignVoucher
);

router.get(
    "/my-vouchers",
    authenticateToken,
    subsidyController.getMyVouchers
);

module.exports = router;
