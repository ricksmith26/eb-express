import {getPreferredSocketId} from '../socketIo.js';

const iceCandidate = (socket, users, io) => {
    socket.on("iceCandidate", ({ to, candidate }) => {
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("iceCandidate", { candidate });
        } else {
            console.log(`[IceCandidate] User ${to} is not connected`);
        }
    });
}

export default iceCandidate;