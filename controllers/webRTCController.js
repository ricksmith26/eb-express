import { io } from '../app.js';
import { users } from '../socketIo/socketIo.js';
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
      console.log(`ATTEMPTING WebRTC message sent to ${toEmail}`);
      const recipientSocketId = users.get(toEmail);
      const callerSocketId = users.get(fromEmail);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('message', { type: 'WEBRTC', message, fromEmail });
        io.to(callerSocketId).emit('message', { type: 'WEBRTC', message, toEmail });
        console.log(`WebRTC message sent to ${toEmail}`);
        return res.json({ success: true, message: 'Message sent' });
      } else {
        console.log(`User ${toEmail} is not connected`);
        return res.status(404).json({ error: 'User is not connected' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to send WebRTC message' });
    }
  }

  async emergencyCallReq(req, res) {
    const { toEmail } = req.body;

    try {
      const recipientSocketId = users.get(toEmail);
      io.to(recipientSocketId).emit('emergencyCall');
      console.log(`Emergency Call message sent to ${toEmail}`);
      return res.json({ success: true, message: 'Message sent' });
    } catch (error) {
      console.error(error);
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