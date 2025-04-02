import {io} from '../app.js';
import { users } from '../socketIo/socketIo.js';


export const WebRTCController = {
    async sendWebRTCReq(req, res) {
        const { toEmail, fromEmail, message } = req.body;

        if (!toEmail || !message) {
            return res.status(400).json({ error: 'toEmail and message are required' });
        }
        try {
            console.log(console.log(`ATTEMPTING WebRTC message sent to ${toEmail}`))
            const recipientSocketId = users.get(toEmail);
            const callerSocketId = users.get(fromEmail)
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
            console.log(error)
        }

    }
}