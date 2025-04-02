const message = (socket, users) => {
    socket.on("message", (message) => {
        socket.broadcast.emit("message", message);
    });
}

export default message