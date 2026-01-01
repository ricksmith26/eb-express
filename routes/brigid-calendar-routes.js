import express from 'express';
import BrigidCalendarController from '../controllers/brigid-calendar-controller.js';
import { verifyAccessToken } from '../middleware/auth.js';

class BrigidCalendarRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = BrigidCalendarController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // Create a new event
    // POST /brigid-calendar/events
    this.router.post(
      '/events',
      verifyAccessToken,
      this.controller.createEvent
    );

    // Get all events for authenticated user
    // GET /brigid-calendar/events
    // Query params: startDate, endDate, status, limit, skip, role (owner|invitee)
    this.router.get(
      '/events',
      verifyAccessToken,
      this.controller.getMyEvents
    );

    // Get today's events
    // GET /brigid-calendar/events/today
    this.router.get(
      '/events/today',
      verifyAccessToken,
      this.controller.getTodayEvents
    );

    // Get events by date range
    // GET /brigid-calendar/events/range?startDate=...&endDate=...
    this.router.get(
      '/events/range',
      verifyAccessToken,
      this.controller.getEventsByDateRange
    );

    // Get events for a specific user (admin/lookup endpoint)
    // GET /brigid-calendar/events/user/:email
    this.router.get(
      '/events/user/:email',
      verifyAccessToken,
      this.controller.getUserEvents
    );

    // Get a specific event
    // GET /brigid-calendar/events/:eventId
    this.router.get(
      '/events/:eventId',
      verifyAccessToken,
      this.controller.getEvent
    );

    // Update an event
    // PUT /brigid-calendar/events/:eventId
    this.router.put(
      '/events/:eventId',
      verifyAccessToken,
      this.controller.updateEvent
    );

    // Delete an event (soft delete by default, ?hard=true for permanent)
    // DELETE /brigid-calendar/events/:eventId
    this.router.delete(
      '/events/:eventId',
      verifyAccessToken,
      this.controller.deleteEvent
    );

    // Respond to event invitation
    // POST /brigid-calendar/events/:eventId/rsvp
    // Body: { response: 'accepted' | 'declined' | 'tentative' }
    this.router.post(
      '/events/:eventId/rsvp',
      verifyAccessToken,
      this.controller.respondToInvitation
    );

    // Add invitees to an event
    // POST /brigid-calendar/events/:eventId/invitees
    // Body: { emails: ['email1@example.com', 'email2@example.com'] }
    this.router.post(
      '/events/:eventId/invitees',
      verifyAccessToken,
      this.controller.addInvitees
    );

    // Remove an invitee from an event
    // DELETE /brigid-calendar/events/:eventId/invitees/:inviteeEmail
    this.router.delete(
      '/events/:eventId/invitees/:inviteeEmail',
      verifyAccessToken,
      this.controller.removeInvitee
    );
  }

  getRouter() {
    return this.router;
  }
}

export default new BrigidCalendarRoutes().getRouter();
