import register from './events/register.js';
import offer from './events/offer.js';
import privateMessage from './events/privateMessage.js';
import callUser from './events/callUser.js';
import acceptCall from './events/acceptCall.js'
import hangUp from './events/hangUp.js'
import answer from './events/answer.js'
import iceCandidate from './events/iceCandidate.js';
import disconnect from './events/disconnect.js'
import message from './events/message.js'
import emergencyCall from './events/emergencyCall.js'
import modeChange from './events/modeChange.js'
import registerAgent from './events/registerAgent.js'
import rejectCall from './events/rejectCall.js'
import registerPushToken from './events/registerPushToken.js'
import declineCall from './events/declineCall.js'
import cancelCall from './events/cancelCall.js'
import registerDevice from './events/registerDevice.js'
import {
  activateVideoFeed,
  videoFeedOffer,
  videoFeedAnswer,
  videoFeedIceCandidate,
  videoFeedDisconnected
} from './events/videoFeed.js'
import DeviceConnectionService from '../services/device-connection-service.js'

// Change from Map<email, socketId> to Map<email, Array<{socketId, deviceType}>>
export const users = new Map();
export const Agents = new Map();

// Pending calls queue for offline recipients
// Structure: Map<recipientEmail, { callerEmail, timestamp, metadata }>
export const pendingCalls = new Map();

/**
 * Get user email by socket ID
 * @param {string} socketId - Socket ID to look up
 * @returns {string|null} - User email or null if not found
 */
export function getUserEmail(socketId) {
    for (const [email, connections] of users.entries()) {
      if (Array.isArray(connections)) {
        // New format: array of connection objects
        const connection = connections.find(conn => conn.socketId === socketId);
        if (connection) return email;
      } else {
        // Legacy format: single socketId (for backward compatibility)
        if (connections === socketId) return email;
      }
    }
    return null;
  }

/**
 * Get all socket IDs for a user's email
 * @param {string} email - User email
 * @returns {Array<{socketId: string, deviceType: string}>} - Array of connections
 */
export function getUserConnections(email) {
    const connections = users.get(email);
    if (!connections) return [];

    // Handle legacy format (single socketId)
    if (typeof connections === 'string') {
      return [{ socketId: connections, deviceType: 'unknown' }];
    }

    // Handle new format (array of connections)
    return connections;
  }

/**
 * Get preferred socket ID for a user based on device priority
 * Priority: web > mobile > unknown
 * @param {string} email - User email
 * @returns {string|null} - Preferred socket ID or null if user not connected
 */
export function getPreferredSocketId(email) {
    const connections = getUserConnections(email);
    if (connections.length === 0) return null;

    // Priority order: web, mobile, unknown
    const web = connections.find(conn => conn.deviceType === 'web');
    if (web) return web.socketId;

    const mobile = connections.find(conn => conn.deviceType === 'mobile');
    if (mobile) return mobile.socketId;

    // Fallback to first connection
    return connections[0].socketId;
  }

/**
 * Add a pending call to the queue
 * @param {string} recipientEmail - Email of the call recipient
 * @param {string} callerEmail - Email of the caller
 * @param {object} metadata - Additional call metadata
 */
export function addPendingCall(recipientEmail, callerEmail, metadata = {}) {
    pendingCalls.set(recipientEmail, {
      callerEmail,
      timestamp: Date.now(),
      ...metadata
    });
    console.log(`[CallQueue] Added pending call: ${callerEmail} -> ${recipientEmail}`);
  }

/**
 * Get pending call for a recipient
 * @param {string} recipientEmail - Email of the recipient
 * @returns {object|null} - Pending call data or null if none exists
 */
export function getPendingCall(recipientEmail) {
    return pendingCalls.get(recipientEmail);
  }

/**
 * Remove a pending call from the queue
 * @param {string} recipientEmail - Email of the recipient
 * @returns {boolean} - True if call was removed, false if none existed
 */
export function removePendingCall(recipientEmail) {
    const existed = pendingCalls.has(recipientEmail);
    pendingCalls.delete(recipientEmail);
    if (existed) {
      console.log(`[CallQueue] Removed pending call for ${recipientEmail}`);
    }
    return existed;
  }

/**
 * Cleanup stale pending calls (older than 5 minutes)
 */
export function cleanupStaleCalls() {
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [email, call] of pendingCalls.entries()) {
      if (now - call.timestamp > MAX_AGE) {
        pendingCalls.delete(email);
        console.log(`[CallQueue] Removed stale call for ${email}`);
      }
    }
  }

// Run cleanup every minute
setInterval(cleanupStaleCalls, 60000);

export const socketInit = (io) => {
    io.on('connection', (socket) => {
      console.log(`⚡: ${socket.id} user just connected!`);
      register(socket, users, io)

      registerPushToken(socket, users)

      offer(socket, users, io)

      privateMessage(socket, users, io)

      callUser(socket, users, io)

      acceptCall(socket, users, io)

      rejectCall(socket, users, io)

      hangUp(socket, users, io)

      answer(socket, users, io)

      iceCandidate(socket, users, io)

      disconnect(socket, users, Agents)

      message(socket, users)

      emergencyCall(socket, users, io)

      modeChange(socket, users, io)

      declineCall(socket, users, io)

      cancelCall(socket, users, io)

      // agentStatusChange(socket, Agents, agent, stat)

      registerAgent(socket, Agents, io)

      // Device registration (IoT devices like Brigid Pi)
      registerDevice(io, socket)

      // Video feed events for emergency calls
      activateVideoFeed(socket, users, io)
      videoFeedOffer(socket, users, io)
      videoFeedAnswer(socket, users, io)
      videoFeedIceCandidate(socket, users, io)
      videoFeedDisconnected(socket, users, io)

      // Status monitoring room for real-time device status updates
      socket.on('joinStatusMonitor', async () => {
        socket.join('status-monitor');
        try {
          const onlineDevices = await DeviceConnectionService.getOnlineDevices();
          socket.emit('statusMonitorJoined', { devices: onlineDevices });
        } catch (error) {
          console.error('Error joining status monitor:', error);
          socket.emit('statusMonitorJoined', { devices: [], error: 'Failed to fetch devices' });
        }
      });
    });
}