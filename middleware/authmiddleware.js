const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
    try {
        // 1. Read Authorization header
        const authHeader = req.headers["authorization"];

        // Expected format:
        // Bearer eyJhbGciOiJIUzI1Ni...

        if (!authHeader) {
            return res.status(401).json({
                error: "Access denied. No token provided."
            });
        }

        // 2. Extract token from "Bearer <token>"
        const [scheme, token] = authHeader.split(" ");

        if (scheme !== "Bearer" || !token) {
            return res.status(401).json({
                error: "Invalid token format. Use: Bearer <token>"
            });
        }

        // 3. Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "development_secret"
        );

        // 4. Attach farmer identity to request
        req.farmer = decoded;

        // 5. Continue to next step
        next();

    } catch (err) {
        return res.status(403).json({
            error: "Invalid or expired token."
        });
    }
};

module.exports = authenticateToken;
