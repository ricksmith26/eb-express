const register = (socket, users) => {
    socket.on('register', (email) => {
        users.set(email, socket.id);
        console.log(`User registered: ${email} -> ${socket.id}`);
    });
}

export default register;