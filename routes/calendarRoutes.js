import express from "express";
import { google } from "googleapis";
import User from "../models/User.js";
import dotenv from "dotenv";
import CalendarController from '../controllers/CalendarController.js'

dotenv.config();

const router = express.Router();

// ✅ Route: Get Today's Events (Auto Refresh Token)
router.get("/:email/today",CalendarController.getTodaysEvents);

// ✅ Route: Get This Week's Events (Auto Refresh Token)
router.get("/:email/week", CalendarController.getThisWeeksCalendar);

export default router;