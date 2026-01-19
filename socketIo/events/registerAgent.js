import DeviceConnectionService from '../../services/device-connection-service.js';

const registerAgent = (socket, agents, io) => {
    socket.on('registerAgent', async (username) => {
        // username may actually be an email - use it directly for practitioner lookup
        const email = username;

        agents.set(username, socket.id);
        console.log(`Agent registered: ${username} -> ${socket.id}`);

        // Persist agent/practitioner connection to database
        try {
            const connection = await DeviceConnectionService.handlePractitionerConnect(email, socket.id, {
                connectedAt: new Date()
            });

            // Broadcast status change to monitors
            DeviceConnectionService.broadcastStatusChange(io, connection, 'online');
        } catch (error) {
            console.error('Error persisting practitioner connection:', error);
        }
    });
}

export default registerAgent;