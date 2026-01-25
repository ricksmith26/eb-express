import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const pendingNotificationSchema = new mongoose.Schema({
  id: { type: String, unique: true, default: () => uuidv4() },

  // Who the notification is for
  userEmail: { type: String, required: true, index: true },
  patientId: { type: String, index: true },

  // Notification type
  type: {
    type: String,
    enum: ['appointment_confirmed', 'appointment_reminder', 'general'],
    required: true
  },

  // Notification data (varies by type)
  data: {
    appointmentDate: String,
    appointmentTime: String,
    doctorName: String,
    patientName: String,
    instructions: String,
    calendarEventId: String,
    roomName: String,
  },

  // Delivery status
  pushNotificationSent: { type: Boolean, default: false },
  pushNotificationSentAt: Date,

  // Facial recognition trigger - when true, facial recognition system should
  // watch for this patient and trigger a Winston session when they're seen
  facialRecognitionTrigger: { type: Boolean, default: false },

  // Acknowledgment
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
  acknowledgedVia: {
    type: String,
    enum: ['push', 'voice', 'facial_recognition', 'manual'],
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
});

// Index for finding unacknowledged notifications
pendingNotificationSchema.index({ userEmail: 1, acknowledged: 1 });

// TTL index to automatically delete expired notifications
pendingNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingNotification = mongoose.model('PendingNotification', pendingNotificationSchema);
export default PendingNotification;
