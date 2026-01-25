import { users, getPreferredSocketId } from '../socketIo/socketIo.js';
import { getDeviceSocketId } from '../socketIo/events/registerDevice.js';
import { sendEventReminderNotification } from './pushNotificationService.js';
import PendingNotification from '../models/PendingNotification.js';
import User from '../models/User.js';
import Patient from '../models/PatientSchema.js';
import FhirDevice from '../models/FhirDevice.js';

const LOG_PREFIX = '[AppointmentNotificationService]';

let io = null;

/**
 * Inject Socket.IO instance for real-time notifications
 */
export function setSocketIO(socketIO) {
  io = socketIO;
  console.log(`${LOG_PREFIX} Socket.IO instance set`);
}

/**
 * Check if a user is currently connected via Socket.IO
 */
export function isUserConnected(email) {
  return users.has(email) && users.get(email)?.length > 0;
}

/**
 * Send appointment notification through multiple channels
 *
 * Flow:
 * 1. Check if user is connected via Socket.IO → emit event to trigger Winston
 * 2. If not connected → send push notification
 * 3. Store pending notification regardless (for later retrieval)
 * 4. Enable facial recognition trigger
 *
 * @param {Object} appointmentData - Appointment details
 * @param {string} appointmentData.userEmail - User's email
 * @param {string} appointmentData.appointmentDate - Date of appointment
 * @param {string} appointmentData.appointmentTime - Time of appointment
 * @param {string} appointmentData.doctorName - Doctor's name
 * @param {string} appointmentData.patientName - Patient's name
 * @param {string} appointmentData.instructions - Special instructions
 * @param {string} appointmentData.calendarEventId - Created calendar event ID
 * @param {string} appointmentData.roomName - LiveKit room name (if user is connected)
 */
export async function sendAppointmentNotification(appointmentData) {
  const {
    userEmail,
    appointmentDate,
    appointmentTime,
    doctorName,
    patientName,
    instructions,
    calendarEventId,
    roomName,
  } = appointmentData;

  console.log(`${LOG_PREFIX} Processing appointment notification for ${userEmail}`);

  // Find patient by email
  let patientId = null;
  try {
    const patient = await Patient.findOne({
      'telecom.system': 'email',
      'telecom.value': userEmail,
    });
    if (patient) {
      patientId = patient.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error finding patient:`, error.message);
  }

  // 1. Check if user is connected via Socket.IO
  const userConnected = isUserConnected(userEmail);
  let notifiedViaSocket = false;

  if (userConnected && io) {
    console.log(`${LOG_PREFIX} User ${userEmail} is connected, sending via Socket.IO`);
    const socketId = getPreferredSocketId(userEmail);

    if (socketId) {
      // Emit event to the connected client
      // The mobile app can use this to trigger a LiveKit session with appointment params
      io.to(socketId).emit('appointmentConfirmed', {
        appointmentDate,
        appointmentTime,
        doctorName,
        patientName,
        instructions,
        calendarEventId,
        // Include params for triggering a LiveKit session
        livekitParams: {
          appointmentDate,
          appointmentTime,
          appointmentDoctor: doctorName,
        },
      });
      notifiedViaSocket = true;
      console.log(`${LOG_PREFIX} Emitted appointmentConfirmed to socket ${socketId}`);
    }
  }

  // 2. Send push notification if not connected via socket
  let pushSent = false;
  if (!notifiedViaSocket) {
    console.log(`${LOG_PREFIX} User ${userEmail} not connected, sending push notification`);

    try {
      const user = await User.findOne({ email: userEmail });

      if (user?.pushNotificationTokens?.length > 0) {
        await sendEventReminderNotification(user.pushNotificationTokens, {
          eventId: calendarEventId || 'appointment',
          eventTitle: `Appointment with ${doctorName}`,
          eventStartTime: parseAppointmentDateTime(appointmentDate, appointmentTime),
        });
        pushSent = true;
        console.log(`${LOG_PREFIX} Push notification sent to ${userEmail}`);
      } else {
        console.log(`${LOG_PREFIX} No push tokens for ${userEmail}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error sending push notification:`, error.message);
    }
  }

  // 3. Store pending notification (for retrieval when user next connects)
  let pendingNotification;
  try {
    pendingNotification = await PendingNotification.create({
      userEmail,
      patientId,
      type: 'appointment_confirmed',
      data: {
        appointmentDate,
        appointmentTime,
        doctorName,
        patientName,
        instructions,
        calendarEventId,
        roomName,
      },
      pushNotificationSent: pushSent,
      pushNotificationSentAt: pushSent ? new Date() : null,
      // Enable facial recognition trigger if user wasn't notified in real-time
      facialRecognitionTrigger: !notifiedViaSocket,
    });
    console.log(`${LOG_PREFIX} Stored pending notification: ${pendingNotification.id}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error storing pending notification:`, error.message);
  }

  // 4. If user wasn't notified via socket, send facial recognition activation to their Pi device
  let facialRecognitionActivated = false;
  if (!notifiedViaSocket && io && patientId) {
    try {
      // Find devices associated with this user's email
      const devices = await FhirDevice.find({
        'owner.email': userEmail,
        status: 'active',
      });

      for (const device of devices) {
        const deviceId = device.getDeviceId();
        const deviceSocketId = getDeviceSocketId(deviceId);

        if (deviceSocketId) {
          // Emit to the device to activate facial recognition check
          io.to(`device:${deviceId}`).emit('activateFacialRecognitionCheck', {
            patientId,
            patientName,
            userEmail,
            notificationId: pendingNotification?.id,
            appointmentData: {
              appointmentDate,
              appointmentTime,
              doctorName,
              instructions,
            },
          });
          facialRecognitionActivated = true;
          console.log(`${LOG_PREFIX} Sent activateFacialRecognitionCheck to device ${deviceId}`);
        } else {
          console.log(`${LOG_PREFIX} Device ${deviceId} not connected, cannot activate FR`);
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error activating facial recognition:`, error.message);
    }
  }

  return {
    notifiedViaSocket,
    pushNotificationSent: pushSent,
    pendingNotificationId: pendingNotification?.id,
    facialRecognitionActivated,
  };
}

/**
 * Get pending notifications for a user (called when Winston session starts)
 */
export async function getPendingNotifications(userEmail) {
  try {
    const notifications = await PendingNotification.find({
      userEmail,
      acknowledged: false,
    }).sort({ createdAt: -1 });

    return notifications;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting pending notifications:`, error.message);
    return [];
  }
}

/**
 * Acknowledge a pending notification
 */
export async function acknowledgeNotification(notificationId, acknowledgedVia = 'voice') {
  try {
    const notification = await PendingNotification.findOneAndUpdate(
      { id: notificationId },
      {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedVia,
        facialRecognitionTrigger: false, // Disable facial recognition once acknowledged
      },
      { new: true }
    );

    if (notification) {
      console.log(`${LOG_PREFIX} Notification ${notificationId} acknowledged via ${acknowledgedVia}`);
    }

    return notification;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error acknowledging notification:`, error.message);
    return null;
  }
}

/**
 * Get pending notifications for facial recognition trigger
 * Called by the facial recognition system when a patient is recognized
 */
export async function getNotificationsForFacialRecognition(patientId) {
  try {
    const notifications = await PendingNotification.find({
      patientId,
      acknowledged: false,
      facialRecognitionTrigger: true,
    }).sort({ createdAt: -1 });

    return notifications;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting notifications for facial recognition:`, error.message);
    return [];
  }
}

/**
 * Parse appointment date and time into a Date object
 */
function parseAppointmentDateTime(dateStr, timeStr) {
  try {
    const combined = `${dateStr} ${timeStr}`;
    let parsed = new Date(combined);

    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Try parsing date separately
    const dateOnly = new Date(dateStr);
    if (!isNaN(dateOnly.getTime())) {
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

    return new Date();
  } catch {
    return new Date();
  }
}

export default {
  setSocketIO,
  isUserConnected,
  sendAppointmentNotification,
  getPendingNotifications,
  acknowledgeNotification,
  getNotificationsForFacialRecognition,
};
