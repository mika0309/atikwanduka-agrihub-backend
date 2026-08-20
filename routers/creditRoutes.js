const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const creditController = require("../controllers/creditController");

router.get(
    "/my-score",
    authenticateToken,
    authorizeRole("farmer"),
    creditController.calculateCreditScore
);

module.exports = router;
