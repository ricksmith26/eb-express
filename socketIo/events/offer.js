const offer = (socket, users, io) => {
    socket.on('offer', (toEmail, offer) => {
        const recipientSocketId = users.get(toEmail);
        io.to(recipientSocketId).emit('offer', { type: 'WEBRTC', offer, toEmail });
    });
}

export default offer