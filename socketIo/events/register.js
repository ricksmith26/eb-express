import { getPendingCall, removePendingCall, getPreferredSocketId } from '../socketIo.js';

/**
 * Register a user's socket connection with optional device type
 * Supports both legacy format (email only) and new format ({email, deviceType})
 */
const register = (socket, users, io) => {
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
            // Check if there's already a connection with this device type
            // Only allow one connection per device type (e.g., one 'mobile', one 'brigid-pi')
            const existingDeviceIndex = connections.findIndex(conn => conn.deviceType === deviceType);
            if (existingDeviceIndex !== -1) {
                const oldSocketId = connections[existingDeviceIndex].socketId;
                console.log(`Replacing existing ${deviceType} connection: ${oldSocketId} -> ${socket.id}`);
                // Remove the old connection
                connections.splice(existingDeviceIndex, 1);
            }

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

        // Check for pending calls
        const pendingCall = getPendingCall(email);

        if (pendingCall) {
            console.log(`[Register] Found pending call for ${email} from ${pendingCall.callerEmail}`);
            console.log(`[Register] Pending call has offer: ${!!pendingCall.offer}`);

            // Get caller's socket
            const callerSocketId = getPreferredSocketId(pendingCall.callerEmail);

            if (callerSocketId) {
                // Notify caller that recipient is now available
                io.to(callerSocketId).emit('recipient_available', {
                    recipientEmail: email,
                    message: 'Recipient is now online, initiating call'
                });

                // Send the stored offer to the recipient
                if (pendingCall.offer) {
                    io.to(socket.id).emit('offer', {
                        from: pendingCall.callerEmail,
                        offer: pendingCall.offer,
                        callId: pendingCall.callId
                    });
                    console.log(`[Register] Sent stored offer to ${email}, callId: ${pendingCall.callId}`);
                } else {
                    // Fallback: notify recipient about incoming call (legacy flow)
                    io.to(socket.id).emit('message', {
                        type: 'WEBRTC',
                        fromEmail: pendingCall.callerEmail,
                        message: pendingCall.metadata?.message || 'call'
                    });
                    console.log(`[Register] No offer stored, sent legacy message to ${email}`);
                }

                console.log(`[Register] Initiated call between ${pendingCall.callerEmail} and ${email}`);
            } else {
                console.log(`[Register] Caller ${pendingCall.callerEmail} is no longer online`);
                // Notify recipient that caller is gone
                io.to(socket.id).emit('call_cancelled', {
                    fromEmail: pendingCall.callerEmail,
                    reason: 'caller_offline'
                });
            }

            // Remove from queue
            removePendingCall(email);
        }
    });
}

export default register;