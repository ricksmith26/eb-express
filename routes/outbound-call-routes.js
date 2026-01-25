import express from 'express';
import outboundCallController from '../controllers/outbound-call-controller.js';

const router = express.Router();

/**
 * POST /outbound-call/callback
 *
 * Callback endpoint for outbound-caller to notify when an appointment is confirmed.
 * This endpoint:
 * 1. Creates a calendar event for the patient
 * 2. Notifies the patient (via push notification or data channel if connected)
 * 3. Stores pending notification if needed
 */
router.post('/callback', outboundCallController.handleCallback);

/**
 * GET /outbound-call/pending-notifications/:email
 *
 * Get pending notifications for a user.
 * Used by Winston to check for notifications when a session starts.
 */
router.get('/pending-notifications/:email', outboundCallController.getPendingNotifications);

/**
 * POST /outbound-call/pending-notifications/:id/acknowledge
 *
 * Acknowledge a pending notification.
 * Called after user confirms they received the notification.
 */
router.post('/pending-notifications/:id/acknowledge', outboundCallController.acknowledgeNotification);

/**
 * GET /outbound-call/facial-recognition/:patientId
 *
 * Get pending notifications triggered by facial recognition.
 * Called by the facial recognition system when a patient is recognized.
 */
router.get('/facial-recognition/:patientId', outboundCallController.getNotificationsForFacialRecognition);

export default router;
