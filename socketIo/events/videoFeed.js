/**
 * Video Feed Socket Events
 * Handles video signaling between agents (web) and devices (Pi) during emergency calls
 *
 * Flow:
 * 1. Agent clicks "Request Camera" → emits activateVideoFeed → Pi receives
 * 2. Pi creates WebRTC offer → emits videoFeedOffer → Agent receives
 * 3. Agent creates answer → emits videoFeedAnswer → Pi receives
 * 4. Both exchange ICE candidates via videoFeedIceCandidate
 * 5. Either side can emit videoFeedDisconnected to end video
 */

import { getPreferredSocketId, getUserEmail, Agents } from '../socketIo.js';
import { getDeviceSocketId } from './registerDevice.js';

/**
 * Get socket ID for an agent (checks both users and Agents maps)
 */
const getAgentSocketId = (email) => {
  // First check the Agents map (agents registered via registerAgent)
  const agentSocketId = Agents.get(email);
  if (agentSocketId) {
    return agentSocketId;
  }
  // Fall back to users map (agents registered as regular users)
  return getPreferredSocketId(email);
};

/**
 * Get email for a socket (checks both users and Agents maps)
 */
const getEmailBySocketId = (socketId) => {
  // First check users map
  const userEmail = getUserEmail(socketId);
  if (userEmail) {
    return userEmail;
  }
  // Check Agents map
  for (const [email, agentSocketId] of Agents.entries()) {
    if (agentSocketId === socketId) {
      return email;
    }
  }
  return null;
};

/**
 * Activate Video Feed - Agent → Pi
 * Sent when agent clicks "Request Camera Access" button
 */
export const activateVideoFeed = (socket, users, io) => {
  socket.on('activateVideoFeed', (data) => {
    const { deviceId, callId } = data || {};
    const agentEmail = getEmailBySocketId(socket.id);

    console.log(`[VideoFeed] Activate request from ${agentEmail} to device ${deviceId}`);

    if (!deviceId) {
      console.log('[VideoFeed] Missing deviceId in activateVideoFeed');
      socket.emit('videoFeedError', { error: 'Device ID required' });
      return;
    }

    const deviceSocketId = getDeviceSocketId(deviceId);
    if (!deviceSocketId) {
      console.log(`[VideoFeed] Device ${deviceId} is not connected`);
      socket.emit('videoFeedError', { error: 'Device not connected' });
      return;
    }

    // Relay to device
    io.to(deviceSocketId).emit('activateVideoFeed', {
      callId,
      agentEmail,
      agentSocketId: socket.id
    });

    console.log(`[VideoFeed] Sent activateVideoFeed to device ${deviceId}`);
  });
};

/**
 * Video Feed Offer - Pi → Agent
 * Pi sends WebRTC offer after receiving activateVideoFeed
 */
export const videoFeedOffer = (socket, users, io) => {
  socket.on('videoFeedOffer', (data) => {
    const { callId, deviceId, offer, agentEmail } = data || {};

    console.log(`[VideoFeed] Offer from device ${deviceId} to ${agentEmail}`);

    if (!agentEmail) {
      console.log('[VideoFeed] Missing agentEmail in videoFeedOffer');
      return;
    }

    const agentSocketId = getAgentSocketId(agentEmail);
    if (!agentSocketId) {
      console.log(`[VideoFeed] Agent ${agentEmail} is not connected`);
      return;
    }

    // Relay offer to agent
    io.to(agentSocketId).emit('videoFeedOffer', {
      callId,
      deviceId,
      offer
    });

    console.log(`[VideoFeed] Relayed offer to agent ${agentEmail}`);
  });
};

/**
 * Video Feed Answer - Agent → Pi
 * Agent sends WebRTC answer in response to offer
 */
export const videoFeedAnswer = (socket, users, io) => {
  socket.on('videoFeedAnswer', (data) => {
    const { callId, deviceId, answer } = data || {};
    const agentEmail = getEmailBySocketId(socket.id);

    console.log(`[VideoFeed] Answer from ${agentEmail} to device ${deviceId}`);

    if (!deviceId) {
      console.log('[VideoFeed] Missing deviceId in videoFeedAnswer');
      return;
    }

    const deviceSocketId = getDeviceSocketId(deviceId);
    if (!deviceSocketId) {
      console.log(`[VideoFeed] Device ${deviceId} is not connected`);
      return;
    }

    // Relay answer to device
    io.to(deviceSocketId).emit('videoFeedAnswer', {
      callId,
      answer
    });

    console.log(`[VideoFeed] Relayed answer to device ${deviceId}`);
  });
};

/**
 * Video Feed ICE Candidate - Bi-directional
 * Both agent and device send ICE candidates to each other
 */
export const videoFeedIceCandidate = (socket, users, io) => {
  socket.on('videoFeedIceCandidate', (data) => {
    const { callId, deviceId, agentEmail, candidate } = data || {};

    // Determine if sender is agent or device
    const senderEmail = getEmailBySocketId(socket.id);

    if (senderEmail) {
      // Sender is agent → relay to device
      console.log(`[VideoFeed] ICE candidate from agent ${senderEmail} to device ${deviceId}`);

      if (!deviceId) {
        console.log('[VideoFeed] Missing deviceId in ICE candidate from agent');
        return;
      }

      const deviceSocketId = getDeviceSocketId(deviceId);
      if (!deviceSocketId) {
        console.log(`[VideoFeed] Device ${deviceId} is not connected`);
        return;
      }

      io.to(deviceSocketId).emit('videoFeedIceCandidate', {
        callId,
        candidate
      });
    } else {
      // Sender is device → relay to agent
      console.log(`[VideoFeed] ICE candidate from device ${deviceId} to agent ${agentEmail}`);

      if (!agentEmail) {
        console.log('[VideoFeed] Missing agentEmail in ICE candidate from device');
        return;
      }

      const agentSocketId = getAgentSocketId(agentEmail);
      if (!agentSocketId) {
        console.log(`[VideoFeed] Agent ${agentEmail} is not connected`);
        return;
      }

      io.to(agentSocketId).emit('videoFeedIceCandidate', {
        callId,
        deviceId,
        candidate
      });
    }
  });
};

/**
 * Video Feed Disconnected - Bi-directional
 * Either side can signal video disconnection
 */
export const videoFeedDisconnected = (socket, users, io) => {
  socket.on('videoFeedDisconnected', (data) => {
    const { callId, deviceId, agentEmail, reason } = data || {};

    const senderEmail = getEmailBySocketId(socket.id);

    if (senderEmail) {
      // Agent is disconnecting → notify device
      console.log(`[VideoFeed] Disconnect from agent ${senderEmail} to device ${deviceId}`);

      if (deviceId) {
        const deviceSocketId = getDeviceSocketId(deviceId);
        if (deviceSocketId) {
          io.to(deviceSocketId).emit('videoFeedDisconnected', {
            callId,
            reason: reason || 'Agent disconnected video'
          });
        }
      }
    } else {
      // Device is disconnecting → notify agent
      console.log(`[VideoFeed] Disconnect from device ${deviceId} to agent ${agentEmail}`);

      if (agentEmail) {
        const agentSocketId = getAgentSocketId(agentEmail);
        if (agentSocketId) {
          io.to(agentSocketId).emit('videoFeedDisconnected', {
            callId,
            deviceId,
            reason: reason || 'Device disconnected video'
          });
        }
      }
    }
  });
};

export default {
  activateVideoFeed,
  videoFeedOffer,
  videoFeedAnswer,
  videoFeedIceCandidate,
  videoFeedDisconnected
};
