const jwt = require("jsonwebtoken");
const config = require("../config/env");

/**
 * Authentication Middleware
 * 
 * Validates JWT token from Authorization header.
 * Expects unified JWT format: { userId, email, phone, role }
 * 
 * Sets req.user with consistent structure:
 * { userId, email, phone, role }
 */
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];

        if (!authHeader) {
            return res.status(401).json({
                error: "Access denied. No token provided."
            });
        }

        const parts = authHeader.split(" ");
        const scheme = parts[0];
        const token = parts[1];

        if (scheme !== "Bearer" || !token) {
            return res.status(401).json({
                error: "Invalid token format. Use: Bearer <token>"
            });
        }

        const decoded = jwt.verify(token, config.getJwtSecret());

        // Normalize to consistent user object
        // Handle both legacy and new JWT formats
        req.user = {
            userId: decoded.userId || decoded.farmer_id || decoded.admin_id || null,
            email: decoded.email || null,
            phone: decoded.phone || null,
            role: decoded.role || "farmer",
            profileId: decoded.profileId || null
        };

        // Backward compatibility for existing controllers that use req.farmer
        if (req.user.role === "farmer") {
            req.farmer = {
                farmer_id: req.user.profileId || req.user.userId,
                ...req.user
            };
        }

        next();
    } catch (err) {
        return res.status(403).json({
            error: "Invalid or expired token."
        });
    }
};

module.exports = authenticateToken;
