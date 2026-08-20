const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authmiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const marketController = require("../controllers/marketController");

router.post(
    "/list-produce",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.createListing
);

router.get(
    "/listings",
    marketController.getListings
);

router.get(
    "/listings/:listingId",
    marketController.getListingById
);

router.get(
    "/buyer-orders",
    authenticateToken,
    authorizeRole("buyer", "farmer"),
    marketController.getBuyerOrders
);

router.get(
    "/my-listings",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.getMyListings
);

router.put(
    "/listings/:listingId",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.updateListing
);

router.delete(
    "/listings/:listingId",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.deleteListing
);

router.get(
    "/my-orders",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.getMyOrders
);

router.get(
    "/analytics",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.getMarketplaceAnalytics
);

router.patch(
    "/confirm-order/:orderId",
    authenticateToken,
    authorizeRole("farmer"),
    marketController.confirmOrder
);

router.post(
    "/place-order",
    authenticateToken,
    authorizeRole("buyer"),
    marketController.placeOrder
);

module.exports = router;
