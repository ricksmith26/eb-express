/**
 * Video Feed Socket Events
 * Handles video signaling between agents (web) and devices (Pi) during emergency calls
 *
 * Routing: Uses email-based lookup for both agents and Pi devices.
 * - Agents are registered via registerAgent or as users
 * - Pi devices register with the patient's email in the users map
 *
 * Flow:
 * 1. Agent clicks "Request Camera" → creates WebRTC offer → emits activateVideoFeed with patientEmail + offer → Pi receives
 * 2. Pi automatically accepts → creates answer → emits videoFeedAnswer with agentEmail → Agent receives
 * 3. Both exchange ICE candidates via videoFeedIceCandidate
 * 4. Either side can emit videoFeedDisconnected to end video
 */

import { getPreferredSocketId, getUserEmail, Agents } from '../socketIo.js';

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
 * Agent creates WebRTC offer and sends it with this event
 * Routes to Pi using patient's email (Pi registers with patient email in users map)
 */
export const activateVideoFeed = (socket, users, io) => {
  socket.on('activateVideoFeed', (data) => {
    const { patientEmail, callId, offer } = data || {};
    const agentEmail = getEmailBySocketId(socket.id);

    console.log(`[VideoFeed] Activate request from ${agentEmail} to patient ${patientEmail}`);
    console.log(`[VideoFeed] Offer included: ${!!offer}`);

    if (!patientEmail) {
      console.log('[VideoFeed] Missing patientEmail in activateVideoFeed');
      socket.emit('videoFeedError', { error: 'Patient email required' });
      return;
    }

    if (!offer) {
      console.log('[VideoFeed] Missing offer in activateVideoFeed');
      socket.emit('videoFeedError', { error: 'WebRTC offer required' });
      return;
    }

    // Pi registers with patient's email in the users map
    const deviceSocketId = getPreferredSocketId(patientEmail);
    if (!deviceSocketId) {
      console.log(`[VideoFeed] No device connected for patient ${patientEmail}`);
      socket.emit('videoFeedError', { error: 'Device not connected' });
      return;
    }

    // Relay to device (Pi) with offer
    io.to(deviceSocketId).emit('activateVideoFeed', {
      callId,
      agentEmail,
      agentSocketId: socket.id,
      offer
    });

    console.log(`[VideoFeed] Sent activateVideoFeed with offer to device for patient ${patientEmail}`);
  });
};

/**
 * Video Feed Offer - Pi → Agent
 * Pi sends WebRTC offer after receiving activateVideoFeed
 */
export const videoFeedOffer = (socket, users, io) => {
  socket.on('videoFeedOffer', (data) => {
    const { callId, deviceId, offer, agentEmail } = data || {};

    console.log(`[VideoFeed] Offer received from device ${deviceId} to agent ${agentEmail}`);
    console.log(`[VideoFeed] Offer data keys:`, Object.keys(data || {}));

    if (!agentEmail) {
      console.log('[VideoFeed] Missing agentEmail in videoFeedOffer');
      return;
    }

    const agentSocketId = getAgentSocketId(agentEmail);
    console.log(`[VideoFeed] Agent socket lookup for ${agentEmail}: ${agentSocketId || 'NOT FOUND'}`);

    if (!agentSocketId) {
      console.log(`[VideoFeed] Agent ${agentEmail} is not connected`);
      // Log Agents map contents for debugging
      console.log(`[VideoFeed] Current Agents map:`, Array.from(Agents.entries()));
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
 * Video Feed Answer - Bi-directional
 * Now primarily used for Pi → Agent (Pi receives offer, sends answer back)
 * Also supports legacy Agent → Pi flow
 */
export const videoFeedAnswer = (socket, users, io) => {
  socket.on('videoFeedAnswer', (data) => {
    const { callId, patientEmail, agentEmail, answer } = data || {};

    // Pi sends answer to agent (new flow: agent offers, Pi answers)
    if (agentEmail) {
      console.log(`[VideoFeed] Answer from Pi to agent ${agentEmail}`);

      const agentSocketId = getAgentSocketId(agentEmail);
      if (!agentSocketId) {
        console.log(`[VideoFeed] Agent ${agentEmail} is not connected`);
        return;
      }

      // Relay answer to agent
      io.to(agentSocketId).emit('videoFeedAnswer', {
        callId,
        answer
      });

      console.log(`[VideoFeed] Relayed answer to agent ${agentEmail}`);
      return;
    }

    // Legacy: Agent sends answer to Pi
    if (patientEmail) {
      const senderEmail = getEmailBySocketId(socket.id);
      console.log(`[VideoFeed] Answer from ${senderEmail} to patient ${patientEmail}`);

      const deviceSocketId = getPreferredSocketId(patientEmail);
      if (!deviceSocketId) {
        console.log(`[VideoFeed] No device connected for patient ${patientEmail}`);
        return;
      }

      io.to(deviceSocketId).emit('videoFeedAnswer', {
        callId,
        answer
      });

      console.log(`[VideoFeed] Relayed answer to device for patient ${patientEmail}`);
    }
  });
};

/**
 * Video Feed ICE Candidate - Bi-directional
 * Both agent and device send ICE candidates to each other
 * Agent sends with patientEmail, Pi sends with agentEmail
 */
export const videoFeedIceCandidate = (socket, users, io) => {
  socket.on('videoFeedIceCandidate', (data) => {
    const { callId, patientEmail, agentEmail, candidate } = data || {};

    // Determine if sender is agent or device based on which email they provided
    // Agent sends patientEmail (to route to Pi)
    // Pi sends agentEmail (to route to agent)

    if (patientEmail) {
      // Sender is agent → relay to device (Pi)
      const senderEmail = getEmailBySocketId(socket.id);
      console.log(`[VideoFeed] ICE candidate from agent ${senderEmail} to patient ${patientEmail}`);

      const deviceSocketId = getPreferredSocketId(patientEmail);
      if (!deviceSocketId) {
        console.log(`[VideoFeed] No device connected for patient ${patientEmail}`);
        return;
      }

      io.to(deviceSocketId).emit('videoFeedIceCandidate', {
        callId,
        candidate
      });
    } else if (agentEmail) {
      // Sender is device (Pi) → relay to agent
      console.log(`[VideoFeed] ICE candidate from device to agent ${agentEmail}`);

      const agentSocketId = getAgentSocketId(agentEmail);
      if (!agentSocketId) {
        console.log(`[VideoFeed] Agent ${agentEmail} is not connected`);
        return;
      }

      io.to(agentSocketId).emit('videoFeedIceCandidate', {
        callId,
        candidate
      });
    } else {
      console.log('[VideoFeed] ICE candidate missing both patientEmail and agentEmail');
    }
  });
};

/**
 * Video Feed Disconnected - Bi-directional
 * Either side can signal video disconnection
 * Agent sends with patientEmail, Pi sends with agentEmail
 */
export const videoFeedDisconnected = (socket, users, io) => {
  socket.on('videoFeedDisconnected', (data) => {
    const { callId, patientEmail, agentEmail, reason } = data || {};

    if (patientEmail) {
      // Agent is disconnecting → notify device (Pi)
      const senderEmail = getEmailBySocketId(socket.id);
      console.log(`[VideoFeed] Disconnect from agent ${senderEmail} to patient ${patientEmail}`);

      const deviceSocketId = getPreferredSocketId(patientEmail);
      if (deviceSocketId) {
        io.to(deviceSocketId).emit('videoFeedDisconnected', {
          callId,
          reason: reason || 'Agent disconnected video'
        });
      }
    } else if (agentEmail) {
      // Device (Pi) is disconnecting → notify agent
      console.log(`[VideoFeed] Disconnect from device to agent ${agentEmail}`);

      const agentSocketId = getAgentSocketId(agentEmail);
      if (agentSocketId) {
        io.to(agentSocketId).emit('videoFeedDisconnected', {
          callId,
          reason: reason || 'Device disconnected video'
        });
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
