const iceCandidate = (socket, users, io) => {
    socket.on("iceCandidate", ({ to, candidate }) => {
        const recipientSocketId = users.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("iceCandidate", { candidate });
        }
    });
}

export default iceCandidate;