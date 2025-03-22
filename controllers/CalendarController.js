import { google } from "googleapis";
import dotenv from "dotenv";
import User from '../models/User.js'
import TokenController from './TokenController.js'
dotenv.config();

const  getCalendarEvents = async(accessToken, timeMin, timeMax) => {
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
  }

const CalendarController = {
    async getTodaysEvents(req, res) {
      try {
        let user = await User.findOne({ email: req.params.email });
    
        if (!user || !user.accessToken) {
          return res.status(404).json({ error: "User not found or no access token available" });
        }
    
        let accessToken = user.accessToken;
    
        // ✅ Refresh token if accessToken has expired
        if (user.refreshToken) {
          accessToken = await TokenController.refreshAccessToken(user) || user.accessToken;
        }
    
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    
        const events = await getCalendarEvents(accessToken, startOfDay, endOfDay);
        res.json(events);
      } catch (error) {
        console.log(error)
        res.status(500).json({ error: "Failed to fetch today's calendar events" });
      }
    },
    async getThisWeeksCalendar (req, res) {
      try {
        let user = await User.findOne({ email: req.params.email });
    
        if (!user || !user.accessToken) {
          return res.status(404).json({ error: "User not found or no access token available" });
        }
    
        let accessToken = user.accessToken;
    
        // ✅ Refresh token if accessToken has expired
        if (user.refreshToken) {
          accessToken = await TokenController.refreshAccessToken(user) || user.accessToken;
        }
    
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
        const endOfWeek = new Date(now.setDate(now.getDate() + (6 - now.getDay()))).toISOString();
    
        const events = await this.getCalendarEvents(accessToken, startOfWeek, endOfWeek);
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch this week's calendar events" });
      }
    },
    async getCalendarEvents(accessToken, timeMin, timeMax) {
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
      }
}

export default CalendarController;