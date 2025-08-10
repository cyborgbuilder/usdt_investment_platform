// File: middleware/auth.middleware.js

const User = require("../models/User");
const jwt = require("jsonwebtoken");

/**
 * Middleware for handling authentication and authorization.
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      const response = {
        success: false,
        message: "Access token required",
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const secret = process.env.JWT_SECRET;
    // if secret not exist
    if (!secret) {
      const response = {
        success: false,
        message: "Something went wrong",
        timestamp: new Date().toISOString(),
      };
      res.status(500).json(response);
      return;
    }

    const decoded = jwt.verify(token, secret);

    // check token type is temp_2fa or not
    if (decoded.type === "temp_2fa") {
      const response = {
        success: false,
        message: "Access token required",
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    // Verify user still exists
    const userExists = await User.findById(decoded.userId);
    if (!userExists) {
      const response = {
        success: false,
        message: "User not found",
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (error) {
    const response = {
      success: false,
      message: "Invalid or expired token",
      timestamp: new Date().toISOString(),
      error: error.message,
    };
    res.status(401).json(response);
  }
};

const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const response = {
          success: false,
          message: "Authentication required",
          timestamp: new Date().toISOString(),
        };
        res.status(401).json(response);
        return;
      }

      if (!allowedRoles.includes(req.user.role)) {
        const response = {
          success: false,
          message: "Insufficient permissions",
          timestamp: new Date().toISOString(),
        };
        res.status(403).json(response);
        return;
      }

      next();
    } catch (error) {
      const response = {
        success: false,
        message: "Authorization failed",
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
    }
  };
};

const requireAdmin = () => {
  return requireRole(["admin"]);
};

const requireUserOrAdmin = () => {
  return requireRole(["user", "admin"]);
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireUserOrAdmin,
};
