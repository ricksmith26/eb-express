import { google } from "googleapis";
import dotenv from "dotenv";
import User from '../models/User.js';
import TokenController from './TokenController.js';
import { dotEnvConfig } from '../config/vars.js';
dotenv.config(dotEnvConfig);

class CalendarController {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );
    this.getTodaysEvents = this.getTodaysEvents.bind(this);
    this.getThisWeeksCalendar = this.getThisWeeksCalendar.bind(this);
    this.getEventsByDate = this.getEventsByDate.bind(this);
    this.addEvent = this.addEvent.bind(this);
  }



  async getAuthenticatedCalendar(user) {
    this.oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    return google.calendar({ version: "v3", auth: this.oauth2Client });
  }

  async getCalendarEvents(user, timeMin, timeMax) {
    const calendar = await this.getAuthenticatedCalendar(user);
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });
    return response.data.items;
  }

  async getTodayEventsData(user) {
    if (user.refreshToken) {
      await TokenController.refreshAccessToken(user);
    }

    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    return await this.getCalendarEvents(user, startOfDay, endOfDay);
  }

  async getTodaysEvents(req, res) {
    try {
      const user = await User.findOne({ email: req.params.email });
      if (!user || !user.refreshToken) {
        return res.status(404).json({ error: "User not found or no access token available" });
      }

      const events = await this.getTodayEventsData(user);
      res.json(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch today's calendar events" });
    }
  }

  async getThisWeeksCalendar(req, res) {
    try {
      const user = await User.findOne({ email: req.params.email });
      if (!user || !user.refreshToken) {
        return res.status(404).json({ error: "User not found or no access token available" });
      }

      await TokenController.refreshAccessToken(user);

      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
      const endOfWeek = new Date(now.setDate(now.getDate() + (6 - now.getDay()))).toISOString();

      const events = await this.getCalendarEvents(user, startOfWeek, endOfWeek);
      res.json(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch this week's calendar events" });
    }
  }

  async getEventsByDate(req, res) {
    try {
      const { email } = req.params;
      const { date } = req.query;

      if (!email || !date) {
        return res.status(400).json({ error: "Email and date are required" });
      }

      const user = await User.findOne({ email });
      if (!user || !user.refreshToken) {
        return res.status(404).json({ error: "User not found or no access token available" });
      }

      await TokenController.refreshAccessToken(user);

      const parsedDate = new Date(date);
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999)).toISOString();

      const events = await this.getCalendarEvents(user, startOfDay, endOfDay);
      res.json(events);
    } catch (error) {
      console.error("<<<< getEventsByDate error", error);
      res.status(500).json({ error: "Failed to fetch events for the specified date" });
    }
  }

  async addEvent(req, res) {
    const { email, summary, start, end, description, location } = req.body;

    if (!email || !summary || !start || !end) {
      return res.status(400).json({ error: "Missing required fields: email, summary, start, end" });
    }

    try {
      const user = await User.findOne({ email });
      if (!user || !user.refreshToken) {
        return res.status(404).json({ error: "User not found or no refresh token available" });
      }

      const calendar = await this.getAuthenticatedCalendar(user);

      const event = {
        summary,
        description: description || '',
        location: location || '',
        start: { dateTime: new Date(start).toISOString(), timeZone: "UTC" },
        end: { dateTime: new Date(end).toISOString(), timeZone: "UTC" },
      };

      const response = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });

      res.status(201).json({ message: "Event created", event: response.data });
    } catch (error) {
      console.error("❌ Error adding event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  }
}

export default new CalendarController();