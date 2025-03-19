import express from "express";
import { google } from "googleapis";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// ✅ Function to refresh Google OAuth token
const refreshAccessToken = async (user) => {
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );

    auth.setCredentials({ refresh_token: user.refreshToken });

    const { credentials } = await auth.refreshAccessToken(); // ✅ Get new access token

    // ✅ Update user with new token
    user.accessToken = credentials.access_token;
    await user.save();

    return credentials.access_token;
  } catch (error) {
    console.error("Failed to refresh access token:", error);
    return null;
  }
};

// ✅ Function to fetch calendar events
const getCalendarEvents = async (accessToken, timeMin, timeMax) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items;
};

// ✅ Route: Get Today's Events (Auto Refresh Token)
router.get("/:email/today", async (req, res) => {
  try {
    let user = await User.findOne({ email: req.params.email });

    if (!user || !user.accessToken) {
      return res.status(404).json({ error: "User not found or no access token available" });
    }

    let accessToken = user.accessToken;

    // ✅ Refresh token if accessToken has expired
    if (user.refreshToken) {
      accessToken = await refreshAccessToken(user) || user.accessToken;
    }

    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    const events = await getCalendarEvents(accessToken, startOfDay, endOfDay);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch today's calendar events" });
  }
});

// ✅ Route: Get This Week's Events (Auto Refresh Token)
router.get("/:email/week", async (req, res) => {
  try {
    let user = await User.findOne({ email: req.params.email });

    if (!user || !user.accessToken) {
      return res.status(404).json({ error: "User not found or no access token available" });
    }

    let accessToken = user.accessToken;

    // ✅ Refresh token if accessToken has expired
    if (user.refreshToken) {
      accessToken = await refreshAccessToken(user) || user.accessToken;
    }

    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const endOfWeek = new Date(now.setDate(now.getDate() + (6 - now.getDay()))).toISOString();

    const events = await getCalendarEvents(accessToken, startOfWeek, endOfWeek);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch this week's calendar events" });
  }
});

export default router;