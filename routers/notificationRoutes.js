const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const notificationController = require("../controllers/notificationController");

router.get(
    "/my-notifications",
    authenticateToken,
    authorizeRole("farmer", "buyer", "transporter"),
    notificationController.getMyNotifications
);

router.patch(
    "/:id/read",
    authenticateToken,
    authorizeRole("farmer", "buyer", "transporter"),
    notificationController.markNotificationAsRead
);

module.exports = router;
