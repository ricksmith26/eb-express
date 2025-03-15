import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import User from '../models/User.js'
import {FRONTEND_URL} from '../config/vars.js'
// import Patient from '../models/PatientSchema'

dotenv.config();

const router = express.Router();

// ✅ Google OAuth Login with Google Drive Scope
router.get(
  "/google",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly", // ✅ Add Google Drive Read Access
    ],
    prompt: "consent", // ✅ Force reauthorization
    accessType: 'offline',
  })
);

// ✅ Google OAuth Callback
router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", async (err, user, info) => {
      if (err) {
        console.error("🚨 Google OAuth Error:", err);
        return res.status(500).json({ error: "Google authentication failed", details: err.message });
      }
      if (!user) {
        console.error("🚨 Google OAuth User Not Found:", info);
        return res.status(401).json({ error: "No user returned from Google authentication" });
      }

      // Log the user details
      console.log(`✅ Google User Authenticated: ${user.email}`);

      // Manually log the user in
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("🚨 Login Error:", loginErr);
          return res.status(500).json({ error: "Session login failed", details: loginErr.message });
        }

        // Set cookie with email
        res.cookie('email', user.email);

        // Ensure accessToken exists
        if (!user.accessToken) {
          console.error("🚨 No Google OAuth token received from MongoDB!");
          return res.status(401).json({ error: "Failed to get Google OAuth token" });
        }

        // Redirect to frontend
        return res.redirect(process.env.FRONTEND_URL);
      });
    })(req, res, next);
  }
);

// ✅ Logout & Clear Session
router.get("/logout", (req, res) => {
  res.clearCookie("token");
  req.logout(() => {
    res.redirect(process.env.FRONTEND_URL);
  });
});

// ✅ Get Logged-in User Info
router.get("/me/", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.cookies.email });
    console.log(user, "<<<<<")
    return res.json(user);
  } catch (error) {
    return res.status(error.status).json({ error });
  }
});

export default router;