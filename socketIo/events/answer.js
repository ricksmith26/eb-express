const answer = (socket, users, io) => {
    socket.on("answer", ({ to, answer }) => {
        const recipientSocketId = users.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("answer", { answer });
        }
    });
}

export default answer