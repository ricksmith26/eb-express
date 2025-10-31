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

// Change from Map<email, socketId> to Map<email, Array<{socketId, deviceType}>>
export const users = new Map();
export const Agents = new Map();

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

export const socketInit = (io) => {
    io.on('connection', (socket) => {
      console.log(`⚡: ${socket.id} user just connected!`);
      register(socket, users)

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

      // agentStatusChange(socket, Agents, agent, stat)

      registerAgent(socket, Agents)
    });
}