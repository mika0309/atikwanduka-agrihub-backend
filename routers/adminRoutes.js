const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const adminController = require("../controllers/adminController");

// Public - admin login
router.post("/login", adminController.login);

// Protected - admin only endpoints
router.get(
    "/farmers",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getFarmers
);

router.get(
    "/buyers",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getBuyers
);

router.get(
    "/transporters",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getTransporters
);

router.get(
    "/marketplace",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getMarketplaceListings
);

router.get(
    "/confirmed-orders",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getConfirmedOrders
);

router.get(
    "/deliveries",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getDeliveries
);

router.get(
    "/vouchers",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getVouchers
);

router.get(
    "/notifications",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getNotifications
);

router.get(
    "/reports",
    authenticateToken,
    authorizeRole("admin"),
    adminController.getReports
);

module.exports = router;
