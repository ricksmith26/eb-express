import passport from "passport";
import dotenv from "dotenv";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { jwtDecode } from "jwt-decode";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class AuthController {
  constructor() {
    this.googleLogin = this.googleLogin.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
    this.logout = this.logout.bind(this);
    this.getMe = this.getMe.bind(this);
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

      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("🚨 Login Error:", loginErr);
          return res.status(500).json({ error: "Session login failed" });
        }

        req.session.user = user;

        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET || "default-secret",
          { expiresIn: "1d" }
        );

        res.setHeader("Authorization", `Bearer ${token}`);
        console.log(`Redirecting to : ${process.env.FRONTEND_URL}/?token=${token}`)
        res.redirect(`${process.env.FRONTEND_URL}/?token=${token}`);
      });
    })(req, res, next);
  }

  logout(req, res) {
    res.clearCookie("token");
    req.logout(() => {
      res.redirect(process.env.FRONTEND_URL);
    });
  }

  async getMe(req, res) {
    try {
      const authHeader = req?.headers?.authorization;
      console.log(authHeader,'<<<<authHeader')
      if (!authHeader) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const decoded = jwtDecode(authHeader.replace("Bearer ", ""));
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("🚨 Error fetching user session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

export default new AuthController();