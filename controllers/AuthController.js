import passport from "passport";
import dotenv from "dotenv";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { dotEnvConfig } from "../config/vars.js";
import { verifyAccessToken } from "../middleware/auth.js";

dotenv.config(dotEnvConfig);

class AuthController {
  constructor() {
    this.googleLogin = this.googleLogin.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
    this.logout = this.logout.bind(this);
    this.getMe = this.getMe.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
  }

  /**
   * Generate JWT access token (short-lived: 15 minutes)
   */
  generateAccessToken(user) {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    return jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // 15 minutes
    );
  }

  /**
   * Generate JWT refresh token (long-lived: 90 days)
   */
  generateRefreshToken(user) {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }

    return jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "90d" } // 90 days
    );
  }

  /**
   * Set authentication cookies
   */
  setAuthCookies(res, accessToken, refreshToken) {
    const isProduction = process.env.NODE_ENV === "production";

    // Cookie options for production (HTTPS with cross-site)
    const cookieOptions = {
      httpOnly: true,
      secure: true, // Always true in production for sameSite: 'none'
      sameSite: isProduction ? "none" : "lax"
    };

    // Access token cookie (15 minutes)
    res.cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    // Refresh token cookie (90 days)
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
    });
  }

  googleLogin(req, res, next) {
    passport.authenticate("google", {
      scope: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive",
      ],
      prompt: "consent",
      accessType: "offline",
    })(req, res, next);
  }

  googleCallback(req, res, next) {
    passport.authenticate("google", async (err, user, info) => {
      if (err) {
        console.error("🚨 Google OAuth Error:", err);
        return res.status(500).json({ error: "Google authentication failed", details: err.message });
      }
      if (!user) {
        console.error("🚨 Google OAuth User Not Found:", info);
        return res.status(401).json({ error: "No user returned from Google authentication" });
      }

      console.log(`✅ Google User Authenticated: ${user.email}`);

      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.error("🚨 Login Error:", loginErr);
          return res.status(500).json({ error: "Session login failed" });
        }

        try {
          req.session.user = user;

          // Generate both access and refresh tokens
          const accessToken = this.generateAccessToken(user);
          const refreshToken = this.generateRefreshToken(user);

          // Store refresh token in database with expiry
          user.jwtRefreshToken = refreshToken;
          user.jwtRefreshTokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
          await user.save();

          // Set HTTP-only cookies
          this.setAuthCookies(res, accessToken, refreshToken);

          console.log(`✅ Tokens generated for: ${user.email}`);

          // Redirect to frontend WITHOUT token in URL
          res.redirect(process.env.FRONTEND_URL);
        } catch (tokenError) {
          console.error("🚨 Token Generation Error:", tokenError);
          return res.status(500).json({ error: "Failed to generate authentication tokens" });
        }
      });
    })(req, res, next);
  }

  async logout(req, res) {
    try {
      // Get user from refresh token if available
      const refreshToken = req.cookies?.refreshToken;

      if (refreshToken) {
        try {
          const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
          const user = await User.findById(decoded.id);

          if (user) {
            // Invalidate refresh token in database
            user.jwtRefreshToken = null;
            user.jwtRefreshTokenExpiry = null;
            await user.save();
          }
        } catch (err) {
          console.log("Could not invalidate refresh token:", err.message);
        }
      }

      // Clear all auth cookies
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      res.clearCookie("token"); // Legacy

      // Logout from passport session
      req.logout(() => {
        res.redirect(process.env.FRONTEND_URL);
      });
    } catch (error) {
      console.error("🚨 Logout Error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }

  async getMe(req, res) {
    try {
      // Use the new middleware - user is already attached to req
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Don't send sensitive tokens to client
      const userResponse = {
        id: user.id,
        googleId: user.googleId,
        name: user.name,
        email: user.email,
        picture: user.picture,
        createdAt: user.createdAt
      };

      res.json(userResponse);
    } catch (error) {
      console.error("🚨 Error fetching user session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Refresh access token using refresh token
   * POST /auth/refresh
   */
  async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          error: "Refresh token required",
          code: "NO_REFRESH_TOKEN"
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      // Get user and verify refresh token matches
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

      // Generate new access token
      const newAccessToken = this.generateAccessToken(user);

      // Optionally rotate refresh token (more secure)
      const newRefreshToken = this.generateRefreshToken(user);
      user.jwtRefreshToken = newRefreshToken;
      user.jwtRefreshTokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await user.save();

      // Set new cookies
      this.setAuthCookies(res, newAccessToken, newRefreshToken);

      console.log(`✅ Tokens refreshed for: ${user.email}`);

      res.json({
        success: true,
        accessToken: newAccessToken // Also send in body for flexibility
      });
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

      console.error("🚨 Token refresh error:", error);
      res.status(500).json({ error: "Token refresh failed" });
    }
  }
}

export default new AuthController();