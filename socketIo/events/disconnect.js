const disconnect = (socket, users) => {
    socket.on('disconnect', () => {
        for (const [email, id] of users.entries()) {
            if (id === socket.id) {
                users.delete(email);
                console.log(`User disconnected: ${email}`);
                break;
            }
        }
    });
}
export default disconnect