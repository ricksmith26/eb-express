const registerAgent = (socket, agents) => {
    socket.on('registerAgent', (username) => {
        agents.set(username, socket.id);
        console.log(`Agent registered: ${username} -> ${socket.id}`);
    });
}

export default registerAgent;