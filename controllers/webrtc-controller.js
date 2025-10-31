import { io } from '../app.js';
import { users, getPreferredSocketId, getUserConnections } from '../socketIo/socketIo.js';
import {AsteriskCredential} from '../models/Asterisk.js'

class WebRTCController {
  constructor() {
    // Bind methods to `this` so they retain context in routers
    this.sendWebRTCReq = this.sendWebRTCReq.bind(this);
    this.emergencyCallReq = this.emergencyCallReq.bind(this);
    this.addAddAsteriskCredentials = this.addAddAsteriskCredentials.bind(this);
  }

  async sendWebRTCReq(req, res) {
    const { toEmail, fromEmail, message } = req.body;

    if (!toEmail || !message) {
      return res.status(400).json({ error: 'toEmail and message are required' });
    }

    try {
      console.log(`[WebRTC Controller] Attempting to send WebRTC message to ${toEmail}`);

      // Use priority routing
      const recipientSocketId = getPreferredSocketId(toEmail);
      const callerSocketId = getPreferredSocketId(fromEmail);

      const recipientConnections = getUserConnections(toEmail);
      const callerConnections = getUserConnections(fromEmail);

      console.log(`[WebRTC Controller] Recipient ${toEmail} has ${recipientConnections.length} connection(s)`);
      console.log(`[WebRTC Controller] Caller ${fromEmail} has ${callerConnections.length} connection(s)`);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('message', { type: 'WEBRTC', message, fromEmail });
        console.log(`[WebRTC Controller] Message sent to recipient ${toEmail} on socket ${recipientSocketId}`);

        if (callerSocketId) {
          io.to(callerSocketId).emit('message', { type: 'WEBRTC', message, toEmail });
          console.log(`[WebRTC Controller] Message sent to caller ${fromEmail} on socket ${callerSocketId}`);
        }

        return res.json({ success: true, message: 'Message sent' });
      } else {
        console.log(`[WebRTC Controller] User ${toEmail} is not connected`);
        return res.status(404).json({ error: 'User is not connected' });
      }
    } catch (error) {
      console.error('[WebRTC Controller] Error:', error);
      res.status(500).json({ error: 'Failed to send WebRTC message' });
    }
  }

  async emergencyCallReq(req, res) {
    const { toEmail } = req.body;

    try {
      // Use priority routing
      const recipientSocketId = getPreferredSocketId(toEmail);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('emergencyCall');
        console.log(`[WebRTC Controller] Emergency call message sent to ${toEmail}`);
        return res.json({ success: true, message: 'Message sent' });
      } else {
        console.log(`[WebRTC Controller] User ${toEmail} is not connected`);
        return res.status(404).json({ error: 'User is not connected' });
      }
    } catch (error) {
      console.error('[WebRTC Controller] Error:', error);
      res.status(500).json({ error: 'Failed to send emergency call' });
    }
  }

  async addAddAsteriskCredentials(req, res) {
    try {
      const credentials = req.body
  
      const newCredential = new AsteriskCredential(credentials);
      await newCredential.save();
      return res.json(newCredential)
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to addAsteriskCredentials' });
    }
  }
}

export default new WebRTCController();