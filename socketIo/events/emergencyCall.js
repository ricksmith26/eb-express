const emergencyCall = (socket, users, io) => {
    socket.on('emergencyCall', (toEmail) => {
        const recipientSocketId = users.get(toEmail);
        io.to(recipientSocketId).emit('emergencyCall');
    });
}

export default emergencyCall