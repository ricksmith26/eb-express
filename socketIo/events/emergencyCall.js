import {getPreferredSocketId} from '../socketIo.js';

const emergencyCall = (socket, users, io) => {
    socket.on('emergencyCall', (toEmail) => {
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('emergencyCall');
        } else {
            console.log(`[EmergencyCall] User ${toEmail} is not connected`);
        }
    });
}

export default emergencyCall