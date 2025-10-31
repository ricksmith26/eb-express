import { AsteriskCredential } from '../../models/Asterisk.js';
import { io } from '../../app.js';
import QueueController from '../../controllers/queue-controller.js'

const disconnect = (socket, users, agents) => {
    console.log('DISCONNECTION<<<<<<<<', agents)
    socket.on('disconnect', async () => {
        // Handle multi-connection user disconnection
        for (const [email, connections] of users.entries()) {
            if (Array.isArray(connections)) {
                // New format: array of connections
                const initialLength = connections.length;
                const filteredConnections = connections.filter(conn => conn.socketId !== socket.id);

                if (filteredConnections.length < initialLength) {
                    // This socket was found and removed
                    if (filteredConnections.length === 0) {
                        // No more connections for this user, remove from map
                        users.delete(email);
                        console.log(`User fully disconnected: ${email} (no more connections)`);
                    } else {
                        // Still has other connections
                        users.set(email, filteredConnections);
                        console.log(`User connection removed: ${email} -> ${socket.id}`);
                        console.log(`  Remaining connections: ${filteredConnections.length}`);
                        filteredConnections.forEach(conn => {
                            console.log(`    - ${conn.socketId} (${conn.deviceType})`);
                        });
                    }
                    break;
                }
            } else if (connections === socket.id) {
                // Legacy format: single socketId
                users.delete(email);
                console.log(`User disconnected: ${email}`);
                break;
            }
        }

        // Handle agent disconnection (unchanged)
        for (const [username, id] of agents.entries()) {
            console.log(agents, '<<<<<<<<', username, id, socket.id)
            if (id === socket.id) {
                QueueController.removeAgentFromQueue(username)
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

