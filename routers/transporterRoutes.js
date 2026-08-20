const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const transporterController = require("../controllers/transporterController");

router.post(
    "/register",
    transporterController.registerTransporter
);

router.post(
    "/assign",
    authenticateToken,
    authorizeRole("admin"),
    transporterController.assignTransporter
);

router.patch(
    "/update-delivery/:deliveryId",
    authenticateToken,
    authorizeRole("admin", "transporter"),
    transporterController.updateDeliveryStatus
);

// Transporter can view their assigned deliveries
router.get(
    "/my-deliveries",
    authenticateToken,
    authorizeRole("transporter"),
    transporterController.getMyDeliveries
);

router.get(
    "/my-deliveries/:deliveryId",
    authenticateToken,
    authorizeRole("transporter"),
    transporterController.getMyDeliveryById
);

module.exports = router;
