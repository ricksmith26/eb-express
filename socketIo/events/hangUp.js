const hangUp = (socket, users, io) => {
    socket.on("hangup", ({ toEmail }) => {
        const recipientSocketId = users.get(toEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("hangup", toEmail);
            console.log(`Call hangup event sent to ${toEmail}`);
        } else {
            console.log(`User ${toEmail} is not connected.`);
        }
    });
}

export default hangUp