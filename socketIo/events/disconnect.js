import { AsteriskCredential } from '../../models/Asterisk.js';

const disconnect = (socket, users, agents) => {
    console.log('DISCONNECTION<<<<<<<<', agents)
    socket.on('disconnect', async () => {
        for (const [email, id] of users.entries()) {
            if (id === socket.id) {
                users.delete(email);
                console.log(`User disconnected: ${email}`);
                break;
            }
        }
        for (const [username, id] of agents.entries()) {
            console.log(agents, '<<<<<<<<', username, id, socket.id)
            if (id === socket.id) {
                agents.delete(username);
                console.log('agents shoul be empty>>>', agents)
                const agent = await AsteriskCredential.findOne({ username });
                if (!agent) {
                    return res.status(404).json({ error: 'Agent not found' });
                }
                agent.status = 'INACTIVE';
                await agent.save();
                io.emit('agentStatusChange', { username: agent.username, status: 'INACTIVE' });
                console.log(`agent disconnected: ${username}`, agent);
                break;
            }
        }
    });
}
export default disconnect

