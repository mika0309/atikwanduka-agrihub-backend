const express = require("express");
const router = express.Router();
const farmerController = require("../controllers/farmerController");
const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

router.post("/register", farmerController.registerFarmer);
router.post("/login", farmerController.loginFarmer);
router.get("/me", authenticateToken, farmerController.getMyProfile);
router.get(
    "/admin-test",
    authenticateToken,
    authorizeRole("admin"),
    (req, res) => {
        res.json({
            message: "Welcome government administrator"
        });
    }
);

module.exports = router;
