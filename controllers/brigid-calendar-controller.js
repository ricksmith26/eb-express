import brigidCalendarService from '../services/brigid-calendar-service.js';

const LOG_PREFIX = '[BrigidCalendarController]';

class BrigidCalendarController {
  constructor() {
    this.createEvent = this.createEvent.bind(this);
    this.getEvent = this.getEvent.bind(this);
    this.updateEvent = this.updateEvent.bind(this);
    this.deleteEvent = this.deleteEvent.bind(this);
    this.getMyEvents = this.getMyEvents.bind(this);
    this.getUserEvents = this.getUserEvents.bind(this);
    this.getTodayEvents = this.getTodayEvents.bind(this);
    this.getEventsByDateRange = this.getEventsByDateRange.bind(this);
    this.respondToInvitation = this.respondToInvitation.bind(this);
    this.addInvitees = this.addInvitees.bind(this);
    this.removeInvitee = this.removeInvitee.bind(this);
  }

  async createEvent(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const eventData = {
        ...req.body,
        ownerEmail: userEmail,
        ownerUserId: req.user?.id
      };

      const event = await brigidCalendarService.createEvent(eventData);

      console.log(`${LOG_PREFIX} Event created by ${userEmail}: ${event.id}`);

      res.status(201).json({
        success: true,
        data: event
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Create event error:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getEvent(req, res) {
    try {
      const { eventId } = req.params;
      const userEmail = req.user?.email;

      const event = await brigidCalendarService.getEventById(eventId);

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      const hasAccess = event.ownerEmail === userEmail ||
        event.invitees.some(i => i.email === userEmail);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.status(200).json({
        success: true,
        data: event
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Get event error:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateEvent(req, res) {
    try {
      const { eventId } = req.params;
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const updatedEvent = await brigidCalendarService.updateEvent(
        eventId,
        req.body,
        userEmail
      );

      console.log(`${LOG_PREFIX} Event updated by ${userEmail}: ${eventId}`);

      res.status(200).json({
        success: true,
        data: updatedEvent
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Update event error:`, error.message);

      const statusCode = error.message.includes('not found') ? 404 :
        error.message.includes('Only the event owner') ? 403 : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteEvent(req, res) {
    try {
      const { eventId } = req.params;
      const userEmail = req.user?.email;
      const { hard } = req.query;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      let result;
      if (hard === 'true') {
        result = await brigidCalendarService.hardDeleteEvent(eventId, userEmail);
      } else {
        result = await brigidCalendarService.deleteEvent(eventId, userEmail);
      }

      console.log(`${LOG_PREFIX} Event deleted by ${userEmail}: ${eventId} (hard=${hard === 'true'})`);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Delete event error:`, error.message);

      const statusCode = error.message.includes('not found') ? 404 :
        error.message.includes('Only the event owner') ? 403 : 500;

      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  async getMyEvents(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { startDate, endDate, status, limit, skip, role } = req.query;

      let events;
      const options = {
        startDate,
        endDate,
        status,
        limit: parseInt(limit) || 100,
        skip: parseInt(skip) || 0
      };

      if (role === 'owner') {
        events = await brigidCalendarService.getOwnedEvents(userEmail, options);
      } else if (role === 'invitee') {
        events = await brigidCalendarService.getInvitedEvents(userEmail, options);
      } else {
        events = await brigidCalendarService.getUserEvents(userEmail, options);
      }

      res.status(200).json({
        success: true,
        count: events.length,
        data: events
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Get my events error:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getUserEvents(req, res) {
    try {
      const { email } = req.params;
      const { startDate, endDate, status, limit, skip } = req.query;

      const options = {
        startDate,
        endDate,
        status,
        limit: parseInt(limit) || 100,
        skip: parseInt(skip) || 0
      };

      const events = await brigidCalendarService.getUserEvents(email, options);

      res.status(200).json({
        success: true,
        count: events.length,
        data: events
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Get user events error:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getTodayEvents(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const events = await brigidCalendarService.getTodayEvents(userEmail);

      res.status(200).json({
        success: true,
        count: events.length,
        data: events
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Get today events error:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getEventsByDateRange(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate query parameters are required'
        });
      }

      const events = await brigidCalendarService.getEventsByDateRange(
        userEmail,
        new Date(startDate),
        new Date(endDate)
      );

      res.status(200).json({
        success: true,
        count: events.length,
        data: events
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Get events by range error:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async respondToInvitation(req, res) {
    try {
      const { eventId } = req.params;
      const { response } = req.body;
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const event = await brigidCalendarService.respondToInvitation(
        eventId,
        userEmail,
        response
      );

      console.log(`${LOG_PREFIX} RSVP by ${userEmail}: ${response} for event ${eventId}`);

      res.status(200).json({
        success: true,
        message: `Successfully responded with: ${response}`,
        data: event
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} RSVP error:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async addInvitees(req, res) {
    try {
      const { eventId } = req.params;
      const { emails } = req.body;
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'emails array is required'
        });
      }

      const event = await brigidCalendarService.addInvitees(
        eventId,
        emails,
        userEmail
      );

      console.log(`${LOG_PREFIX} Invitees added by ${userEmail} to event ${eventId}`);

      res.status(200).json({
        success: true,
        data: event
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Add invitees error:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async removeInvitee(req, res) {
    try {
      const { eventId, inviteeEmail } = req.params;
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const event = await brigidCalendarService.removeInvitee(
        eventId,
        inviteeEmail,
        userEmail
      );

      console.log(`${LOG_PREFIX} Invitee ${inviteeEmail} removed by ${userEmail} from event ${eventId}`);

      res.status(200).json({
        success: true,
        data: event
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Remove invitee error:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new BrigidCalendarController();
