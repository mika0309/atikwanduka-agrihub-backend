const authorizeRole = (allowedRole) => {
    return (req, res, next) => {
        if (!req.farmer) {
            return res.status(401).json({
                error: "Access denied. Authentication required."
            });
        }

        if (req.farmer.role !== allowedRole) {
            return res.status(403).json({
                error: "Access denied. Insufficient permissions."
            });
        }

        next();
    };
};

module.exports = authorizeRole;
