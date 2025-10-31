import {getUserEmail, getPreferredSocketId} from '../socketIo.js'
import callHistoryService from '../../services/call-history-service.js';

const acceptCall = (socket, users, io) => {
    socket.on("acceptCall", async ({ from, callId }) => {
        const accepterEmail = getUserEmail(socket.id);
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(from);

        if (recipientSocketId) {
            try {
                // Update call history to mark as accepted
                if (callId) {
                    await callHistoryService.acceptCall(callId);
                    console.log(`[AcceptCall] Call ${callId} accepted by ${accepterEmail}`);
                }

                io.to(recipientSocketId).emit("callAccepted", {
                    from: accepterEmail,
                    callId
                });
            } catch (error) {
                console.error(`[AcceptCall] Error updating call history:`, error);
                // Still emit the acceptance even if history logging fails
                io.to(recipientSocketId).emit("callAccepted", { from: accepterEmail });
            }
        }
    });
}

export default acceptCall;