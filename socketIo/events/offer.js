import {getPreferredSocketId} from '../socketIo.js';

const offer = (socket, users, io) => {
    socket.on('offer', (toEmail, offer) => {
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('offer', { type: 'WEBRTC', offer, toEmail });
        } else {
            console.log(`[Offer] User ${toEmail} is not connected`);
        }
    });
}

export default offer