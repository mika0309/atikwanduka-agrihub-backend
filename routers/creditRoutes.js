const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const creditController = require("../controllers/creditController");

router.get(
    "/my-score",
    authenticateToken,
    creditController.calculateCreditScore
);

module.exports = router;
