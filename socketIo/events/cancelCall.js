import { getPreferredSocketId, removePendingCall } from '../socketIo.js';
import { getUserEmail } from '../socketIo.js';

/**
 * Handle call cancellation event
 * Notifies the recipient that the caller cancelled the call
 */
const cancelCall = (socket, users, io) => {
    socket.on('cancel_call', ({ recipientEmail }) => {
        const callerEmail = getUserEmail(socket.id);

        if (!callerEmail) {
            console.error('[CancelCall] Could not find user email for socket:', socket.id);
            return;
        }

        console.log(`[CancelCall] User ${callerEmail} cancelled call to ${recipientEmail}`);

        // Remove from pending queue
        removePendingCall(recipientEmail);

        // If recipient is online, notify them
        const recipientSocketId = getPreferredSocketId(recipientEmail);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call_cancelled', {
                callerEmail: callerEmail
            });
            console.log(`[CancelCall] Notified recipient ${recipientEmail} that call was cancelled`);
        }
    });
}

export default cancelCall;
