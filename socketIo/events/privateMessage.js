const privateMessage = (socket, users, io) => {
    socket.on('privateMessage', ({ toEmail, message, type }) => {
        console.log({ toEmail, message, type })
        const recipientSocketId = users.get(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message', { type, message });
            console.log(`Message sent to ${toEmail}`);
        } else {
            console.log(`User ${toEmail} is not connected`);
        }
    });
}

export default privateMessage;