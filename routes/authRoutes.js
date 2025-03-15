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

// router.get('/auth/google/callback', 
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   function(req, res) {
//     // console.log(req.user
//     //   , "<<<<<req, /auth/google/callback")
//     // Successful authentication, redirect home.
//     res.redirect('/');
//   });

// ✅ Google OAuth Callback
router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", async (err, user, info) => {
      console.log(req.session, '<><<><><><>req.session<',req.user)
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
        res.cookie('refreshtoken', user.refreshtoken);
            // console.log(req, "<<<<")
            req.header("refreshtoken>>",user.refreshtoken)
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
  console.log("Session Data:", req.session); // ✅ Debugging: Check if session exists
  console.log("Session User:", req.user); // ✅ Debugging: Check if Passport sets `req.user`

  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // ✅ Get user from MongoDB using session user ID
    const user = await User.findById(req.user._id);
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