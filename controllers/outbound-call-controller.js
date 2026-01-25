import brigidCalendarService from '../services/brigid-calendar-service.js';
import appointmentNotificationService from '../services/appointment-notification-service.js';

const LOG_PREFIX = '[OutboundCallController]';

class OutboundCallController {
  constructor() {
    this.handleCallback = this.handleCallback.bind(this);
    this.getPendingNotifications = this.getPendingNotifications.bind(this);
    this.acknowledgeNotification = this.acknowledgeNotification.bind(this);
    this.getNotificationsForFacialRecognition = this.getNotificationsForFacialRecognition.bind(this);
  }

  /**
   * Handle callback from outbound-caller when an appointment is confirmed.
   *
   * Actions:
   * 1. Create calendar event using brigidCalendarService
   * 2. Check if user is in active LiveKit room -> send via data channel
   * 3. If not connected -> send push notification
   * 4. If no response -> store pending notification & enable facial recognition trigger
   */
  async handleCallback(req, res) {
    console.log(`${LOG_PREFIX} Received appointment callback:`, req.body);

    try {
      const {
        success,
        date: appointmentDate,
        time: appointmentTime,
        doctor: doctorName,
        patient_name: patientName,
        user_email: userEmail,
        instructions,
        room_name: roomName,
      } = req.body;

      if (!success) {
        console.log(`${LOG_PREFIX} Appointment was not successful, skipping calendar creation`);
        return res.json({ success: true, message: 'Callback received (no action needed for failed appointment)' });
      }

      if (!userEmail) {
        console.error(`${LOG_PREFIX} No user_email in callback`);
        return res.status(400).json({ success: false, error: 'user_email required' });
      }

      // Parse appointment date and time into ISO format
      const startTime = this.parseAppointmentDateTime(appointmentDate, appointmentTime);

      if (!startTime) {
        console.error(`${LOG_PREFIX} Could not parse appointment date/time: ${appointmentDate} ${appointmentTime}`);
        return res.status(400).json({ success: false, error: 'Could not parse appointment date/time' });
      }

      // Calculate end time (assume 1 hour appointment)
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      // 1. Create calendar event
      let calendarEventId = null;
      try {
        const eventData = {
          title: `Doctor Appointment with ${doctorName}`,
          description: instructions || `Appointment scheduled by AI assistant for ${patientName}`,
          location: `${doctorName}'s Office`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          ownerEmail: userEmail,
          category: 'appointment',
        };

        const event = await brigidCalendarService.createEvent(eventData, 'outbound-caller');
        calendarEventId = event.id;
        console.log(`${LOG_PREFIX} Calendar event created: ${calendarEventId}`);
      } catch (calendarError) {
        console.error(`${LOG_PREFIX} Failed to create calendar event:`, calendarError.message);
        // Continue with notification even if calendar fails
      }

      // 2-5. Multi-channel notification:
      // - Check if user is connected via Socket.IO → send real-time event
      // - If not connected → send push notification
      // - Store pending notification for later retrieval
      // - Enable facial recognition trigger if not notified in real-time
      const notificationResult = await appointmentNotificationService.sendAppointmentNotification({
        userEmail,
        appointmentDate,
        appointmentTime,
        doctorName,
        patientName,
        instructions,
        calendarEventId,
        roomName,
      });

      console.log(`${LOG_PREFIX} Notification result:`, notificationResult);

      res.json({
        success: true,
        message: 'Appointment callback processed',
        data: {
          calendarEventCreated: !!calendarEventId,
          calendarEventId,
          appointmentDate,
          appointmentTime,
          doctor: doctorName,
          notification: notificationResult,
        }
      });

    } catch (error) {
      console.error(`${LOG_PREFIX} Error handling callback:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Parse various date/time formats into a Date object
   */
  parseAppointmentDateTime(dateStr, timeStr) {
    try {
      // Common formats:
      // Date: "January 27, 2026", "2026-01-27", "27/01/2026"
      // Time: "10:30 AM", "14:00", "2:30pm"

      // Combine date and time
      const combined = `${dateStr} ${timeStr}`;

      // Try native Date parsing first
      let parsed = new Date(combined);

      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      // Try parsing date separately
      const dateOnly = new Date(dateStr);
      if (!isNaN(dateOnly.getTime())) {
        // Parse time
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const period = timeMatch[3]?.toUpperCase();

          if (period === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period === 'AM' && hours === 12) {
            hours = 0;
          }

          dateOnly.setHours(hours, minutes, 0, 0);
          return dateOnly;
        }
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Date parsing error:`, error);
      return null;
    }
  }

  /**
   * Get pending notifications for a user.
   * Used by Winston to check for notifications when a session starts.
   */
  async getPendingNotifications(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({ success: false, error: 'email required' });
      }

      const notifications = await appointmentNotificationService.getPendingNotifications(email);

      res.json({
        success: true,
        notifications,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting pending notifications:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Acknowledge a pending notification.
   */
  async acknowledgeNotification(req, res) {
    try {
      const { id } = req.params;
      const { acknowledgedVia } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'notification id required' });
      }

      const notification = await appointmentNotificationService.acknowledgeNotification(
        id,
        acknowledgedVia || 'manual'
      );

      if (!notification) {
        return res.status(404).json({ success: false, error: 'Notification not found' });
      }

      res.json({
        success: true,
        notification,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Error acknowledging notification:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get pending notifications triggered by facial recognition.
   * Called by the facial recognition system when a patient is recognized.
   */
  async getNotificationsForFacialRecognition(req, res) {
    try {
      const { patientId } = req.params;

      if (!patientId) {
        return res.status(400).json({ success: false, error: 'patientId required' });
      }

      const notifications = await appointmentNotificationService.getNotificationsForFacialRecognition(patientId);

      res.json({
        success: true,
        notifications,
        // If there are notifications, include data needed to trigger a Winston session
        triggerSession: notifications.length > 0,
        sessionParams: notifications.length > 0 ? {
          userEmail: notifications[0].userEmail,
          appointmentDate: notifications[0].data?.appointmentDate,
          appointmentTime: notifications[0].data?.appointmentTime,
          appointmentDoctor: notifications[0].data?.doctorName,
        } : null,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting notifications for facial recognition:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new OutboundCallController();
