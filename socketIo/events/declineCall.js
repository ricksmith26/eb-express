import { getPreferredSocketId, removePendingCall } from '../socketIo.js';
import { getUserEmail } from '../socketIo.js';

/**
 * Handle call decline event
 * Notifies the caller that the recipient declined the call
 */
const declineCall = (socket, users, io) => {
    socket.on('decline_call', ({ callerEmail }) => {
        const recipientEmail = getUserEmail(socket.id);

        if (!recipientEmail) {
            console.error('[DeclineCall] Could not find user email for socket:', socket.id);
            return;
        }

        console.log(`[DeclineCall] User ${recipientEmail} declined call from ${callerEmail}`);

        // Get caller's socket
        const callerSocketId = getPreferredSocketId(callerEmail);

        if (callerSocketId) {
            io.to(callerSocketId).emit('call_declined', {
                recipientEmail: recipientEmail
            });
            console.log(`[DeclineCall] Notified caller ${callerEmail} that call was declined`);
        }

        // Remove from pending queue if it was queued
        removePendingCall(recipientEmail);
    });
}

export default declineCall;
