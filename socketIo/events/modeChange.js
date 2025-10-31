import {getPreferredSocketId} from '../socketIo.js';

const modeChange = (socket, users, io) => {
    socket.on('modeChange', (toEmail) => {
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('modeChange');
        } else {
            console.log(`[ModeChange] User ${toEmail} is not connected`);
        }
    });
}

export default modeChange