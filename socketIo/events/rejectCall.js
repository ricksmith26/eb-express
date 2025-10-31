import {getUserEmail, getPreferredSocketId} from '../socketIo.js'
import callHistoryService from '../../services/call-history-service.js';

const rejectCall = (socket, users, io) => {
    socket.on("rejectCall", async ({ from, callId }) => {
        const rejecterEmail = getUserEmail(socket.id);
        // Use priority routing
        const recipientSocketId = getPreferredSocketId(from);

        try {
            // Update call history to mark as rejected
            if (callId) {
                await callHistoryService.rejectCall(callId);
                console.log(`[RejectCall] Call ${callId} rejected by ${rejecterEmail}`);
            }

            if (recipientSocketId) {
                io.to(recipientSocketId).emit("callRejected", {
                    from: rejecterEmail,
                    callId
                });
                console.log(`Call rejection event sent to ${from}`);
            } else {
                console.log(`User ${from} is not connected.`);
            }
        } catch (error) {
            console.error(`[RejectCall] Error updating call history:`, error);
            // Still emit rejection even if history logging fails
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("callRejected", { from: rejecterEmail });
            }
        }
    });
}

export default rejectCall;
