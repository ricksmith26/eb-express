import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import User from '../models/User.js'
import { FRONTEND_URL } from '../config/vars.js'
import jwt from "jsonwebtoken";
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

// router.get('/auth/google/callback', 
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   function(req, res) {
//     // console.log(req.user
//     //   , "<<<<<req, /auth/google/callback")
//     // Successful authentication, redirect home.
//     res.redirect('/');
//   });

// ✅ Google OAuth Callback
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", async (err, user, info) => {
    console.log({ user, info }, '<<<<<USER')
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

      // ✅ Store user in session manually
      req.session.user = user;
      req.email = user.email;
      console.log("✅ Stored user in session:", req.session.user);
      // ✅ Generate JWT Token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || "default-secret", // Ensure JWT_SECRET is set in .env
        { expiresIn: "1d" } // Token expires in 1 day
      );

      // ✅ Store JWT in a Secure HTTP-Only Cookie
      res.cookie("auth_token", token, {
        secure: process.env.NODE_ENV === "production", // Use HTTPS only in production
        // sameSite: "None", // Required for cross-origin authentication
        maxAge: 24 * 60 * 60 * 1000, // 1-day expiration
        path: "/", // Available across all routes
      });

      res.redirect(process.env.FRONTEND_URL);
    });
  })(req, res, next);
});

// ✅ Logout & Clear Session
router.get("/logout", (req, res) => {
  res.clearCookie("token");
  req.logout(() => {
    res.redirect(process.env.FRONTEND_URL);
  });
});

// ✅ Get Logged-in User Info
router.get("/me", async (req, res) => {
  // console.log("Session Data:", req.session); // ✅ Debugging: Check if session exists
  // console.log("Session User:", req.user); // ✅ Debugging: Check if Passport sets `req.user`
  const {email} = req.params;
  console.log(req.params, '<<<<<<req.param', req.session.passport.user)
  try {
    if (!req?.session?.passport?.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // ✅ Get user from MongoDB using session user ID
    const user = await User.findById(req.session.passport.user);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    console.error("🚨 Error fetching user session:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;