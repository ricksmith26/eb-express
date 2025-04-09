const modeChange = (socket, users, io) => {
    socket.on('modeChange', (toEmail) => {
        const recipientSocketId = users.get(toEmail);
        io.to(recipientSocketId).emit('modeChange');
    });
}

export default modeChange