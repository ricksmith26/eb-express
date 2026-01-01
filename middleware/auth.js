import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Middleware to verify JWT access tokens
 * Usage: Add to routes that require authentication
 */
export const verifyAccessToken = async (req, res, next) => {
  try {
    // Check for token in Authorization header or cookies
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.accessToken;

    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        code: "NO_TOKEN"
      });
    }

    // Verify JWT signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
        code: "TOKEN_EXPIRED"
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token",
        code: "INVALID_TOKEN"
      });
    }

    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to verify JWT refresh tokens
 * Used specifically for the /auth/refresh endpoint
 */
export const verifyRefreshToken = async (req, res, next) => {
  try {
    // Check for refresh token in cookies or body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: "Refresh token required",
        code: "NO_REFRESH_TOKEN"
      });
    }

    // Verify JWT signature and expiration
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Verify refresh token exists in database and hasn't been revoked
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        error: "User not found",
        code: "USER_NOT_FOUND"
      });
    }

    if (user.jwtRefreshToken !== refreshToken) {
      return res.status(401).json({
        error: "Invalid refresh token",
        code: "REFRESH_TOKEN_MISMATCH"
      });
    }

    if (user.jwtRefreshTokenExpiry && user.jwtRefreshTokenExpiry < new Date()) {
      return res.status(401).json({
        error: "Refresh token expired",
        code: "REFRESH_TOKEN_EXPIRED"
      });
    }

    // Attach user to request
    req.user = user;
    req.refreshToken = refreshToken;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Refresh token expired",
        code: "REFRESH_TOKEN_EXPIRED"
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid refresh token",
        code: "INVALID_REFRESH_TOKEN"
      });
    }

    console.error("Refresh token verification error:", error);
    res.status(500).json({ error: "Token verification failed" });
  }
};

/**
 * Middleware to verify API key for agent/service-to-service calls
 * Usage: Add to routes that need to support AI agent access
 */
export const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: "API key required",
      code: "NO_API_KEY"
    });
  }

  if (apiKey !== process.env.AGENT_API_KEY) {
    return res.status(401).json({
      error: "Invalid API key",
      code: "INVALID_API_KEY"
    });
  }

  // For API key auth, the agent must specify the user email in the request
  // Check header first, then body
  const agentUserEmail = req.headers['x-agent-user-email'] || req.body?.userEmail;

  if (!agentUserEmail) {
    return res.status(400).json({
      error: "Agent must specify user email via X-Agent-User-Email header or userEmail in body",
      code: "NO_USER_EMAIL"
    });
  }

  req.user = {
    email: agentUserEmail,
    isAgent: true
  };

  next();
};

/**
 * Middleware that accepts either JWT token OR API key
 * Use this for endpoints that need to support both user and agent access
 */
export const verifyAccessTokenOrApiKey = async (req, res, next) => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];

  if (apiKey) {
    // Validate API key
    if (apiKey !== process.env.AGENT_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        code: "INVALID_API_KEY"
      });
    }

    // For API key auth, the agent must specify the user email
    const agentUserEmail = req.headers['x-agent-user-email'] || req.body?.userEmail;

    if (!agentUserEmail) {
      return res.status(400).json({
        error: "Agent must specify user email via X-Agent-User-Email header or userEmail in body",
        code: "NO_USER_EMAIL"
      });
    }

    req.user = {
      email: agentUserEmail,
      isAgent: true
    };

    return next();
  }

  // Fall back to JWT verification
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.accessToken;
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        code: "NO_TOKEN"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
        code: "TOKEN_EXPIRED"
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token",
        code: "INVALID_TOKEN"
      });
    }

    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Helper function to get user from JWT token (for migration purposes)
 * This extracts and verifies the token, returning the user object
 */
export const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.accessToken;

  const token = authHeader?.replace("Bearer ", "") || cookieToken;

  if (!token) {
    throw new Error("No token provided");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};
