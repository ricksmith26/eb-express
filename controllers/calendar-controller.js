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
    this.subscribeToCalendarUpdates = this.subscribeToCalendarUpdates.bind(this);
    this.unsubscribeFromCalendarUpdates = this.unsubscribeFromCalendarUpdates.bind(this);
  }

  async getAuthenticatedCalendar(user) {
    this.oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    return google.calendar({ version: "v3", auth: this.oauth2Client });
  }

  /**
   * Execute a Google Calendar API call with automatic token refresh on 401/403
   */
  async executeWithTokenRefresh(user, apiCall) {
    try {
      return await apiCall();
    } catch (error) {
      // Check if error is due to expired/invalid token
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log("🔄 Google token expired, refreshing...");

        // Refresh the Google OAuth access token
        const newAccessToken = await TokenController.refreshAccessToken(user);

        if (!newAccessToken) {
          throw new Error("Failed to refresh Google access token");
        }

        console.log("✅ Google token refreshed, retrying request...");

        // Retry the API call with new token
        return await apiCall();
      }

      // If not a token error, rethrow
      throw error;
    }
  }

  async getCalendarEvents(user, timeMin, timeMax) {
    const calendar = await this.getAuthenticatedCalendar(user);

    // Wrap API call with auto-refresh
    return await this.executeWithTokenRefresh(user, async () => {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });
      return response.data.items;
    });
  }

  async getTodayEventsData(user) {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    // getCalendarEvents already handles token refresh automatically
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

      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
      const endOfWeek = new Date(now.setDate(now.getDate() + (6 - now.getDay()))).toISOString();

      // getCalendarEvents already handles token refresh automatically
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

      const parsedDate = new Date(date);
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999)).toISOString();

      // getCalendarEvents already handles token refresh automatically
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

      // Wrap API call with auto-refresh
      const response = await this.executeWithTokenRefresh(user, async () => {
        return await calendar.events.insert({
          calendarId: "primary",
          resource: event,
        });
      });

      res.status(201).json({ message: "Event created", event: response.data });
    } catch (error) {
      console.error("❌ Error adding event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  }

  /**
   * Subscribe to Google Calendar push notifications
   * This sets up a webhook that Google will call when the user's calendar changes
   */
  async subscribeToCalendarUpdates(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await User.findOne({ email });
      if (!user || !user.refreshToken) {
        return res.status(404).json({ error: "User not found or no refresh token available" });
      }

      const calendar = await this.getAuthenticatedCalendar(user);

      // Generate a unique channel ID for this user
      const channelId = `calendar-${user._id}-${Date.now()}`;
      const webhookUrl = `${process.env.API_URL}/webhook/google-calendar`;

      console.log(`📅 Subscribing to calendar updates for ${email}`);
      console.log(`Webhook URL: ${webhookUrl}`);

      // Wrap API call with auto-refresh
      const response = await this.executeWithTokenRefresh(user, async () => {
        return await calendar.events.watch({
          calendarId: 'primary',
          requestBody: {
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
            token: user._id.toString(), // Use user ID as verification token
          },
        });
      });

      // Store the channel information in the user document
      user.calendarChannelId = response.data.id;
      user.calendarResourceId = response.data.resourceId;
      user.calendarChannelExpiration = new Date(parseInt(response.data.expiration));
      await user.save();

      console.log('✅ Successfully subscribed to calendar updates:', response.data);

      res.status(200).json({
        message: 'Successfully subscribed to calendar updates',
        channelId: response.data.id,
        expiration: user.calendarChannelExpiration,
      });
    } catch (error) {
      console.error('❌ Error subscribing to calendar updates:', error);
      res.status(500).json({
        error: 'Failed to subscribe to calendar updates',
        details: error.message
      });
    }
  }

  /**
   * Unsubscribe from Google Calendar push notifications
   */
  async unsubscribeFromCalendarUpdates(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await User.findOne({ email });
      if (!user || !user.calendarChannelId) {
        return res.status(404).json({
          error: "User not found or no active subscription"
        });
      }

      const calendar = await this.getAuthenticatedCalendar(user);

      // Wrap API call with auto-refresh
      await this.executeWithTokenRefresh(user, async () => {
        return await calendar.channels.stop({
          requestBody: {
            id: user.calendarChannelId,
            resourceId: user.calendarResourceId,
          },
        });
      });

      // Clear the channel information from the user document
      user.calendarChannelId = undefined;
      user.calendarResourceId = undefined;
      user.calendarChannelExpiration = undefined;
      await user.save();

      console.log(`✅ Successfully unsubscribed from calendar updates for ${email}`);

      res.status(200).json({
        message: 'Successfully unsubscribed from calendar updates',
      });
    } catch (error) {
      console.error('❌ Error unsubscribing from calendar updates:', error);
      res.status(500).json({
        error: 'Failed to unsubscribe from calendar updates',
        details: error.message
      });
    }
  }
}

export default new CalendarController();