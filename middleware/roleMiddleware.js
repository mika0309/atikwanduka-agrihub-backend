const authorizeRole = (...allowedRoles) => {
    const allowed = allowedRoles.flat();

    return (req, res, next) => {
        if (!req.user && !req.farmer) {
            return res.status(401).json({
                error: "Access denied. Authentication required."
            });
        }

        const role = req.user?.role || req.farmer?.role;

        if (!allowed.includes(role)) {
            return res.status(403).json({
                error: "Access denied. Insufficient permissions."
            });
        }

        next();
    };
};

module.exports = authorizeRole;
