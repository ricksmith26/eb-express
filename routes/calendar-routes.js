import express from "express";
import dotenv from "dotenv";
import CalendarController from "../controllers/calendar-controller.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class CalendarRoutes {
  constructor() {
    this.router = express.Router();
    this.calendarController = CalendarController; // This assumes CalendarController is already a singleton

    this.initializeRoutes();
  }

  initializeRoutes() {
    // ✅ Add Event
    this.router.post("/event", this.calendarController.addEvent);

    // ✅ Events by Specific Date
    this.router.get("/:email/date", this.calendarController.getEventsByDate);

    // ✅ Today's Events
    this.router.get("/:email/today", this.calendarController.getTodaysEvents);

    // ✅ This Week's Events
    this.router.get("/:email/week", this.calendarController.getThisWeeksCalendar);
  }

  getRouter() {
    return this.router;
  }
}

export default new CalendarRoutes().getRouter();