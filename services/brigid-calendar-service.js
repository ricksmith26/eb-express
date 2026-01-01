import BrigidCalendarEvent from '../models/BrigidCalendarEvent.js';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX = '[BrigidCalendarService]';

class BrigidCalendarService {
  constructor() {
    this.agenda = null;
    this.io = null;
  }

  setAgenda(agenda) {
    this.agenda = agenda;
    console.log(`${LOG_PREFIX} Agenda instance injected`);
  }

  setSocketIO(io) {
    this.io = io;
    console.log(`${LOG_PREFIX} Socket.IO instance injected`);
  }

  // ==================== CRUD Operations ====================

  async createEvent(eventData, createdBy = 'user') {
    const {
      title,
      description,
      location,
      startTime,
      endTime,
      timezone,
      allDay,
      ownerEmail,
      ownerUserId,
      invitees,
      reminders,
      isRecurring,
      recurrence,
      color,
      category
    } = eventData;

    if (!title || !startTime || !endTime || !ownerEmail) {
      throw new Error('Missing required fields: title, startTime, endTime, ownerEmail');
    }

    if (new Date(startTime) >= new Date(endTime)) {
      throw new Error('startTime must be before endTime');
    }

    const event = new BrigidCalendarEvent({
      title,
      description,
      location,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      timezone: timezone || 'UTC',
      allDay: allDay || false,
      ownerEmail,
      ownerUserId,
      invitees: this._processInvitees(invitees, ownerEmail),
      reminders: reminders || [{ minutesBefore: 15, method: 'push' }],
      isRecurring: isRecurring || false,
      recurrence,
      color,
      category,
      _brigid: {
        createdBy,
        version: 1
      }
    });

    const savedEvent = await event.save();

    await this._scheduleReminders(savedEvent);
    await this._notifyInvitees(savedEvent, 'invited');

    console.log(`${LOG_PREFIX} Event created: ${savedEvent.id} - ${savedEvent.title}`);

    return savedEvent;
  }

  async getEventById(eventId) {
    return await BrigidCalendarEvent.findOne({ id: eventId });
  }

  async getUserEvents(email, options = {}) {
    return await BrigidCalendarEvent.findUserEvents(email, options);
  }

  async getOwnedEvents(email, options = {}) {
    return await BrigidCalendarEvent.findByOwner(email, options);
  }

  async getInvitedEvents(email, options = {}) {
    return await BrigidCalendarEvent.findByInvitee(email, options);
  }

  async getEventsByDateRange(email, startDate, endDate) {
    return await BrigidCalendarEvent.findUserEvents(email, {
      startDate,
      endDate,
      status: 'scheduled'
    });
  }

  async getTodayEvents(email) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return this.getEventsByDateRange(email, startOfDay, endOfDay);
  }

  async updateEvent(eventId, updateData, userEmail) {
    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.ownerEmail !== userEmail) {
      throw new Error('Only the event owner can update the event');
    }

    const allowedUpdates = [
      'title', 'description', 'location', 'startTime', 'endTime',
      'timezone', 'allDay', 'invitees', 'reminders', 'isRecurring',
      'recurrence', 'color', 'category', 'status'
    ];

    const timeChanged = updateData.startTime &&
      new Date(updateData.startTime).getTime() !== event.startTime.getTime();

    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        if (key === 'invitees') {
          event.invitees = this._processInvitees(updateData.invitees, event.ownerEmail);
        } else if (key === 'startTime' || key === 'endTime') {
          event[key] = new Date(updateData[key]);
        } else {
          event[key] = updateData[key];
        }
      }
    }

    event._brigid.version += 1;

    const savedEvent = await event.save();

    if (timeChanged) {
      await this._cancelReminders(savedEvent);
      await this._scheduleReminders(savedEvent);
    }

    await this._notifyInvitees(savedEvent, 'updated');

    console.log(`${LOG_PREFIX} Event updated: ${savedEvent.id}`);

    return savedEvent;
  }

  async deleteEvent(eventId, userEmail) {
    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.ownerEmail !== userEmail) {
      throw new Error('Only the event owner can delete the event');
    }

    await this._cancelReminders(event);
    await this._notifyInvitees(event, 'cancelled');

    event.status = 'cancelled';
    await event.save();

    console.log(`${LOG_PREFIX} Event cancelled: ${eventId}`);

    return event;
  }

  async hardDeleteEvent(eventId, userEmail) {
    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.ownerEmail !== userEmail) {
      throw new Error('Only the event owner can delete the event');
    }

    await this._cancelReminders(event);
    await BrigidCalendarEvent.deleteOne({ id: eventId });

    console.log(`${LOG_PREFIX} Event hard deleted: ${eventId}`);

    return { deleted: true, eventId };
  }

  // ==================== RSVP / Invitee Management ====================

  async respondToInvitation(eventId, userEmail, response) {
    const validResponses = ['accepted', 'declined', 'tentative'];
    if (!validResponses.includes(response)) {
      throw new Error(`Invalid response. Must be one of: ${validResponses.join(', ')}`);
    }

    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    const invitee = event.invitees.find(i => i.email === userEmail);

    if (!invitee) {
      throw new Error('You are not invited to this event');
    }

    invitee.status = response;
    invitee.respondedAt = new Date();

    await event.save();

    await this._notifyOrganizer(event, userEmail, response);

    console.log(`${LOG_PREFIX} RSVP: ${userEmail} ${response} event ${eventId}`);

    return event;
  }

  async addInvitees(eventId, inviteeEmails, userEmail) {
    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.ownerEmail !== userEmail) {
      throw new Error('Only the event owner can add invitees');
    }

    const newInvitees = [];
    for (const email of inviteeEmails) {
      if (!event.invitees.some(i => i.email === email)) {
        newInvitees.push({
          email,
          status: 'pending',
          isOrganizer: false
        });
      }
    }

    event.invitees.push(...newInvitees);
    await event.save();

    for (const invitee of newInvitees) {
      await this._notifySingleUser(invitee.email, 'invited', event);
    }

    return event;
  }

  async removeInvitee(eventId, inviteeEmail, userEmail) {
    const event = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.ownerEmail !== userEmail) {
      throw new Error('Only the event owner can remove invitees');
    }

    event.invitees = event.invitees.filter(i => i.email !== inviteeEmail);
    await event.save();

    await this._notifySingleUser(inviteeEmail, 'removed', event);

    return event;
  }

  // ==================== Recurring Events ====================

  async generateRecurringInstances(eventId, until) {
    const masterEvent = await BrigidCalendarEvent.findOne({ id: eventId });

    if (!masterEvent || !masterEvent.isRecurring) {
      throw new Error('Event not found or not recurring');
    }

    const instances = [];
    const untilDate = until ? new Date(until) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const { frequency, interval, count, until: ruleUntil } = masterEvent.recurrence;

    let currentDate = new Date(masterEvent.startTime);
    let instanceCount = 0;
    const maxInstances = count || 365;
    const endDate = ruleUntil ? new Date(ruleUntil) : untilDate;

    while (currentDate <= endDate && instanceCount < maxInstances) {
      const existingInstance = await BrigidCalendarEvent.findOne({
        parentEventId: eventId,
        originalStartTime: currentDate
      });

      if (!existingInstance && currentDate > new Date()) {
        const duration = masterEvent.endTime - masterEvent.startTime;
        const instanceData = masterEvent.toObject();

        delete instanceData._id;
        delete instanceData.createdAt;
        delete instanceData.updatedAt;

        const instance = new BrigidCalendarEvent({
          ...instanceData,
          id: uuidv4(),
          parentEventId: eventId,
          originalStartTime: new Date(currentDate),
          startTime: new Date(currentDate),
          endTime: new Date(currentDate.getTime() + duration),
          isRecurring: false,
          recurrence: undefined
        });

        await instance.save();
        await this._scheduleReminders(instance);
        instances.push(instance);
      }

      currentDate = this._advanceDate(currentDate, frequency, interval || 1);
      instanceCount++;
    }

    console.log(`${LOG_PREFIX} Generated ${instances.length} recurring instances for event ${eventId}`);

    return instances;
  }

  // ==================== Private Helper Methods ====================

  _processInvitees(invitees, ownerEmail) {
    if (!invitees || !Array.isArray(invitees)) {
      return [{
        email: ownerEmail,
        status: 'accepted',
        isOrganizer: true
      }];
    }

    const processed = invitees.map(inv => ({
      email: inv.email,
      name: inv.name,
      userId: inv.userId,
      status: inv.email === ownerEmail ? 'accepted' : 'pending',
      isOrganizer: inv.email === ownerEmail
    }));

    if (!processed.some(i => i.email === ownerEmail)) {
      processed.unshift({
        email: ownerEmail,
        status: 'accepted',
        isOrganizer: true
      });
    }

    return processed;
  }

  async _scheduleReminders(event) {
    if (!this.agenda) {
      console.log(`${LOG_PREFIX} No agenda instance - skipping reminder scheduling`);
      return;
    }
    if (event.status !== 'scheduled') {
      console.log(`${LOG_PREFIX} Event status is ${event.status} - skipping reminder scheduling`);
      return;
    }

    const jobIds = [];
    const now = new Date();

    console.log(`${LOG_PREFIX} Scheduling reminders for event ${event.id}, startTime: ${event.startTime}, now: ${now}`);
    console.log(`${LOG_PREFIX} Event has ${event.reminders?.length || 0} reminders`);

    for (const reminder of event.reminders) {
      if (reminder.sent) {
        console.log(`${LOG_PREFIX} Reminder already sent, skipping`);
        continue;
      }

      const reminderTime = new Date(event.startTime.getTime() - reminder.minutesBefore * 60 * 1000);
      console.log(`${LOG_PREFIX} Reminder ${reminder.minutesBefore}min before -> reminderTime: ${reminderTime}`);

      // If reminder time is in the past but event hasn't started, schedule for 1 minute from now
      let scheduleTime = reminderTime;
      if (reminderTime <= now && event.startTime > now) {
        scheduleTime = new Date(now.getTime() + 60 * 1000); // 1 minute from now
        console.log(`${LOG_PREFIX} Reminder time was in past, scheduling for ${scheduleTime} instead`);
      }

      if (scheduleTime > now) {
        const job = await this.agenda.schedule(scheduleTime, 'brigid-calendar-reminder', {
          eventId: event.id,
          reminderId: reminder.id,
          ownerEmail: event.ownerEmail,
          inviteeEmails: event.invitees.map(i => i.email),
          eventTitle: event.title,
          eventStartTime: event.startTime,
          method: reminder.method
        });

        jobIds.push(job.attrs._id.toString());
        console.log(`${LOG_PREFIX} Scheduled reminder job at ${scheduleTime}`);
      } else {
        console.log(`${LOG_PREFIX} Event already started, skipping reminder`);
      }
    }

    if (jobIds.length > 0) {
      event._brigid.agendaJobIds = jobIds;
      await event.save();
      console.log(`${LOG_PREFIX} Scheduled ${jobIds.length} reminders for event ${event.id}`);
    } else {
      console.log(`${LOG_PREFIX} No reminders scheduled for event ${event.id} (all in past or none defined)`);
    }
  }

  async _cancelReminders(event) {
    if (!this.agenda) return;

    await this.agenda.cancel({
      name: 'brigid-calendar-reminder',
      'data.eventId': event.id
    });

    console.log(`${LOG_PREFIX} Cancelled reminders for event ${event.id}`);
  }

  async _notifyInvitees(event, action) {
    if (!this.io) return;

    for (const invitee of event.invitees) {
      if (!invitee.isOrganizer) {
        await this._notifySingleUser(invitee.email, action, event);
      }
    }
  }

  async _notifySingleUser(email, action, event) {
    if (!this.io) return;

    try {
      const { getPreferredSocketId } = await import('../socketIo/socketIo.js');

      const socketId = getPreferredSocketId(email);
      if (socketId) {
        this.io.to(socketId).emit('brigidCalendarUpdate', {
          action,
          event: {
            id: event.id,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            ownerEmail: event.ownerEmail
          }
        });
        console.log(`${LOG_PREFIX} Notified ${email} of ${action} for event ${event.id}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error notifying user ${email}:`, error.message);
    }
  }

  async _notifyOrganizer(event, responderEmail, response) {
    if (!this.io) return;

    try {
      const { getPreferredSocketId } = await import('../socketIo/socketIo.js');

      const socketId = getPreferredSocketId(event.ownerEmail);
      if (socketId) {
        this.io.to(socketId).emit('brigidCalendarRSVP', {
          eventId: event.id,
          eventTitle: event.title,
          responderEmail,
          response
        });
        console.log(`${LOG_PREFIX} Notified organizer of RSVP: ${responderEmail} ${response}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error notifying organizer:`, error.message);
    }
  }

  _advanceDate(date, frequency, interval) {
    const newDate = new Date(date);
    switch (frequency) {
      case 'daily':
        newDate.setDate(newDate.getDate() + interval);
        break;
      case 'weekly':
        newDate.setDate(newDate.getDate() + (7 * interval));
        break;
      case 'monthly':
        newDate.setMonth(newDate.getMonth() + interval);
        break;
      case 'yearly':
        newDate.setFullYear(newDate.getFullYear() + interval);
        break;
    }
    return newDate;
  }
}

export default new BrigidCalendarService();
