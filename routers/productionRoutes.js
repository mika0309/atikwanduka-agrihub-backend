const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const productionController = require("../controllers/productionController");

router.post(
    "/add",
    authenticateToken,
    authorizeRole("farmer"),
    productionController.addProductionRecord
);

router.get(
    "/my-records",
    authenticateToken,
    authorizeRole("farmer"),
    productionController.getMyProductionRecords
);

module.exports = router;
