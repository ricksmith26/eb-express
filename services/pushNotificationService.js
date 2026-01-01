import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;

  try {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log('[PushNotificationService] Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('[PushNotificationService] Failed to initialize Firebase Admin SDK:', error);
    console.error('[PushNotificationService] Make sure firebase-service-account.json exists in the project root');
  }
}

// Initialize on module load
initializeFirebase();

/**
 * Send a push notification for an incoming WebRTC call using FCM
 * @param {Array} pushTokens - Array of FCM push tokens
 * @param {Object} callData - Call information
 * @param {string} callData.fromEmail - Caller's email
 * @param {string} callData.fromName - Caller's name
 * @param {string} callData.callId - Call ID
 * Note: WebRTC offer is NOT included - too large for FCM (4KB limit)
 * The offer should be exchanged via socket after app opens
 * @returns {Promise<Array>} Array of message IDs
 */
export async function sendCallNotification(pushTokens, callData) {
  // Don't log full callData as it may contain large offer objects
  console.log('[PushNotificationService] sendCallNotification called for:', {
    fromEmail: callData.fromEmail,
    fromName: callData.fromName,
    callId: callData.callId,
    tokenCount: pushTokens?.length
  });
  if (!firebaseInitialized) {
    console.error('[PushNotificationService] Firebase not initialized, cannot send notification');
    return [];
  }

  const { fromEmail, fromName, callId } = callData;
  const results = [];

  for (const pushToken of pushTokens) {
    try {
      // Send notification+data message so it shows when app is killed/background
      const message = {
        token: pushToken.token,
        notification: {
          title: `Incoming call from ${fromName || fromEmail}`,
          body: 'Tap to answer',
        },
        data: {
          type: 'webrtc_call',
          callId: callId || '',
          fromEmail: fromEmail || '',
          fromName: fromName || '',
          // Note: offer intentionally NOT included - exceeds FCM 4KB limit
          // App should fetch offer via socket after opening
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'notification_icon',
            color: '#2196F3',
            channelId: 'calls',
            sound: 'default',
            priority: 'max',
            defaultVibrateTimings: true,
            sticky: true,
            tag: 'call',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              category: 'call',
              'content-available': 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('[PushNotificationService] Successfully sent message:', response);
      results.push(response);
    } catch (error) {
      console.error('[PushNotificationService] Error sending push notification:', error);

      // Handle invalid token errors
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log('[PushNotificationService] Token is invalid and should be removed:', pushToken.token);
      }
    }
  }

  return results;
}

/**
 * Send a push notification for a new message using FCM
 * @param {Array} pushTokens - Array of FCM push tokens
 * @param {Object} messageData - Message information
 * @param {string} messageData.fromEmail - Sender's email
 * @param {string} messageData.fromName - Sender's name
 * @param {string} messageData.messageId - Message ID
 * @param {string} messageData.messageText - Message preview
 * @returns {Promise<Array>} Array of message IDs
 */
export async function sendMessageNotification(pushTokens, messageData) {
  if (!firebaseInitialized) {
    console.error('[PushNotificationService] Firebase not initialized, cannot send notification');
    return [];
  }

  const { fromEmail, fromName, messageId, messageText } = messageData;
  const results = [];

  for (const pushToken of pushTokens) {
    try {
      const message = {
        token: pushToken.token,
        notification: {
          title: fromName || fromEmail,
          body: messageText || 'New message',
        },
        data: {
          type: 'message',
          messageId: messageId || '',
          fromEmail: fromEmail || '',
          fromName: fromName || '',
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'notification_icon',
            color: '#2196F3',
            channelId: 'messages',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('[PushNotificationService] Successfully sent message notification:', response);
      results.push(response);
    } catch (error) {
      console.error('[PushNotificationService] Error sending message notification:', error);

      // Handle invalid token errors
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log('[PushNotificationService] Token is invalid and should be removed:', pushToken.token);
      }
    }
  }

  return results;
}

/**
 * Send a push notification for a calendar event reminder
 * @param {Array} pushTokens - Array of FCM push tokens
 * @param {Object} eventData - Event information
 * @param {string} eventData.eventId - Event ID
 * @param {string} eventData.eventTitle - Event title
 * @param {Date} eventData.eventStartTime - Event start time
 * @returns {Promise<Array>} Array of message IDs
 */
export async function sendEventReminderNotification(pushTokens, eventData) {
  if (!firebaseInitialized) {
    console.error('[PushNotificationService] Firebase not initialized, cannot send notification');
    return [];
  }

  const { eventId, eventTitle, eventStartTime } = eventData;
  const results = [];

  for (const pushToken of pushTokens) {
    try {
      const message = {
        token: pushToken.token,
        notification: {
          title: 'Event Reminder',
          body: `${eventTitle} starts at ${new Date(eventStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        },
        data: {
          type: 'calendar_reminder',
          eventId: eventId || '',
          eventTitle: eventTitle || '',
          eventStartTime: eventStartTime?.toString() || '',
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'notification_icon',
            color: '#4CAF50',
            channelId: 'calendar',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('[PushNotificationService] Successfully sent calendar reminder:', response);
      results.push(response);
    } catch (error) {
      console.error('[PushNotificationService] Error sending calendar reminder:', error);

      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log('[PushNotificationService] Token is invalid and should be removed:', pushToken.token);
      }
    }
  }

  return results;
}

export default {
  sendCallNotification,
  sendMessageNotification,
  sendEventReminderNotification,
};
