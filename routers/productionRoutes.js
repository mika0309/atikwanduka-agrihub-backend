const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const productionController = require("../controllers/productionController");

router.post(
    "/add",
    authenticateToken,
    productionController.addProductionRecord
);

router.get(
    "/my-records",
    authenticateToken,
    productionController.getMyProductionRecords
);

module.exports = router;
