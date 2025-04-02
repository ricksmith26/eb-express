import {getUserEmail} from '../utils/getUserEmail.js'

const acceptCall = (socket, users, io) => {
    socket.on("acceptCall", ({ from }) => {
        const recipientSocketId = users.get(from);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("callAccepted", { from: getUserEmail(socket.id) });
        }
    });
}

export default acceptCall;