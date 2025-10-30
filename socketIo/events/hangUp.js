import callHistoryService from '../../services/call-history-service.js';
import {getUserEmail} from '../utils/getUserEmail.js'

const hangUp = (socket, users, io) => {
    socket.on("hangup", async ({ toEmail, callId, endReason, connectionQuality }) => {
        const fromEmail = getUserEmail(socket.id);
        const recipientSocketId = users.get(toEmail);

        try {
            // Update call history to mark as ended
            if (callId) {
                await callHistoryService.endCall(callId, {
                    endReason: endReason || 'completed',
                    connectionQuality
                });
                console.log(`[HangUp] Call ${callId} ended by ${fromEmail}`);
            }

            if (recipientSocketId) {
                io.to(recipientSocketId).emit("hangup", { from: fromEmail, callId });
                console.log(`Call hangup event sent to ${toEmail}`);
            } else {
                console.log(`User ${toEmail} is not connected.`);
            }
        } catch (error) {
            console.error(`[HangUp] Error updating call history:`, error);
            // Still emit hangup even if history logging fails
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("hangup", { from: fromEmail });
            }
        }
    });
}

export default hangUp;