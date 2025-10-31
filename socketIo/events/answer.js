import {getPreferredSocketId} from '../socketIo.js';

const answer = (socket, users, io) => {
    socket.on("answer", ({ to, answer }) => {
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("answer", { answer });
        } else {
            console.log(`[Answer] User ${to} is not connected`);
        }
    });
}

export default answer