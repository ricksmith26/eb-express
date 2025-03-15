// import express from "express";
// import passport from "passport";
// import dotenv from "dotenv";
// import User from '../models/User.js'
// // import Patient from '../models/PatientSchema'

// dotenv.config();

// const router = express.Router();

// // ✅ Google OAuth Login with Google Drive Scope
// router.get(
//   "/google",
//   passport.authenticate("google", {
//     scope: [
//       "profile",
//       "email",
//       "https://www.googleapis.com/auth/calendar.readonly",
//       "https://www.googleapis.com/auth/drive.readonly", // ✅ Add Google Drive Read Access
//     ],
//     prompt: "consent", // ✅ Force reauthorization
//     accessType: 'offline',
//   })
// );

// // ✅ Google OAuth Callback
// router.get(
//   "/google/callback",
//   passport.authenticate("google", { failureRedirect: "/" }),
//   async (req, res) => {
//     console.log(req.user.email, '<<<<req.user.email')
//     res.cookie('email', req.user.email)
//     if (!req.user || !req.user.accessToken) {
//       console.error("🚨 No Google OAuth token received from MongoDB!");
//       return res.status(401).json({ error: "Failed to get Google OAuth token" });
//     }
//     res.redirect(process.env.FRONTEND_URL);
//   }
// );

// // ✅ Logout & Clear Session
// router.get("/logout", (req, res) => {
//   res.clearCookie("token");
//   req.logout(() => {
//     res.redirect(process.env.FRONTEND_URL);
//   });
// });

// // ✅ Get Logged-in User Info
// router.get("/me/", async (req, res) => {
//   try {
//     const user = await User.findOne({ email: req.cookies.email });
//     return res.json(user);
//   } catch (error) {
//     return res.status(error.status).json({ error });
//   }
// });

// export default router;