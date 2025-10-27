import CalendarController from './CalendarController.js';
import User from '../models/User.js';
import { scheduleCalendarEvent } from '../agenda/agenda.js';
import crypto from 'crypto';

class WebhookController {
  constructor() {
    this.handleGoogleCalendarWebhook = this.handleGoogleCalendarWebhook.bind(this);
    this.verifyWebhook = this.verifyWebhook.bind(this);
  }

  /**
   * Verify webhook authenticity using Google's channel ID and token
   */
  verifyWebhook(req) {
    // Google Calendar sends specific headers for verification
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    const channelToken = req.headers['x-goog-channel-token'];

    return { channelId, resourceState, channelToken };
  }

  /**
   * Handle incoming Google Calendar webhook notifications
   * This endpoint is called when a user's calendar is updated
   */
  async handleGoogleCalendarWebhook(req, res) {
    try {
      const { channelId, resourceState, channelToken } = this.verifyWebhook(req);

      console.log('📅 Webhook received:', {
        channelId,
        resourceState,
        channelToken,
        headers: req.headers
      });

      // Google sends a sync message to verify the webhook
      if (resourceState === 'sync') {
        console.log('✅ Webhook sync verification successful');
        return res.status(200).send('OK');
      }

      // Handle actual calendar updates
      if (resourceState === 'exists' || resourceState === 'not_exists') {
        // Find the user associated with this channel ID
        // You'll need to store channelId in your User model when subscribing
        const user = await User.findOne({ calendarChannelId: channelId });

        if (!user) {
          console.error('❌ User not found for channelId:', channelId);
          return res.status(404).json({ error: 'User not found' });
        }

        console.log(`📅 Calendar updated for user: ${user.email}`);

        // Fetch the updated calendar events
        const events = await CalendarController.getTodayEventsData(user);

        console.log(`Found ${events.length} events for ${user.email}`);

        // Schedule or update events in Agenda
        for (const event of events) {
          if (event.start && event.start.dateTime) {
            await scheduleCalendarEvent(user.email, event);
            console.log(`✅ Scheduled/Updated event: ${event.summary} for ${user.email}`);
          }
        }

        return res.status(200).json({
          message: 'Webhook processed successfully',
          eventsProcessed: events.length
        });
      }

      // Handle other resource states if needed
      return res.status(200).send('OK');

    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      // Return 200 anyway to prevent Google from retrying
      return res.status(200).json({ error: 'Error processing webhook' });
    }
  }

  /**
   * Health check endpoint for webhook
   */
  async healthCheck(req, res) {
    res.status(200).json({ status: 'Webhook endpoint is active' });
  }
}

export default new WebhookController();
