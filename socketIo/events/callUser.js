import {getUserEmail} from '../utils/getUserEmail.js'

const callUser = (socket, users, io) => {
    socket.on("callUser", ({ toEmail, offer }) => {
        const recipientSocketId = users.get(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("offer", { from: getUserEmail(socket.id), offer });
        }
    });
}

export default callUser;