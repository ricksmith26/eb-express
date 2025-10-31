/**
 * Register a user's socket connection with optional device type
 * Supports both legacy format (email only) and new format ({email, deviceType})
 */
const register = (socket, users) => {
    socket.on('register', (data) => {
        let email, deviceType;

        // Support both old format (string email) and new format ({email, deviceType})
        if (typeof data === 'string') {
            email = data;
            deviceType = 'unknown';
        } else if (data && typeof data === 'object') {
            email = data.email;
            deviceType = data.deviceType || 'unknown';
        } else {
            console.error('Invalid registration data:', data);
            return;
        }

        if (!email) {
            console.error('Registration failed: No email provided');
            return;
        }

        // Get existing connections for this email
        let connections = users.get(email);

        // Initialize as array if doesn't exist or convert legacy format
        if (!connections) {
            connections = [];
        } else if (typeof connections === 'string') {
            // Convert legacy single socketId to array format
            connections = [{ socketId: connections, deviceType: 'unknown' }];
        }

        // Check if this socket is already registered (shouldn't happen, but handle it)
        const existingIndex = connections.findIndex(conn => conn.socketId === socket.id);
        if (existingIndex !== -1) {
            // Update device type if socket already registered
            connections[existingIndex].deviceType = deviceType;
            console.log(`User re-registered: ${email} -> ${socket.id} (${deviceType})`);
        } else {
            // Add new connection
            connections.push({
                socketId: socket.id,
                deviceType: deviceType,
                connectedAt: new Date().toISOString()
            });
            console.log(`User registered: ${email} -> ${socket.id} (${deviceType})`);
        }

        users.set(email, connections);

        // Log all connections for this user
        console.log(`Total connections for ${email}:`, connections.length);
        console.log(users)
        connections.forEach(conn => {
            console.log(`  - ${conn.socketId} (${conn.deviceType})`);
        });
    });
}

export default register;