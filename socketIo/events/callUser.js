import {getUserEmail} from '../utils/getUserEmail.js'
import callHistoryService from '../../services/call-history-service.js';

const callUser = (socket, users, io) => {
    socket.on("callUser", async ({ toEmail, offer, callerName, recipientName }) => {
        const callerEmail = getUserEmail(socket.id);
        const recipientSocketId = users.get(toEmail);

        if (recipientSocketId) {
            try {
                // Create call history record
                const communication = await callHistoryService.initiateCall({
                    callerEmail,
                    callerName: callerName || callerEmail,
                    recipientEmail: toEmail,
                    recipientName: recipientName || toEmail,
                    socketIds: {
                        caller: socket.id,
                        recipient: recipientSocketId
                    },
                    isEmergency: false,
                    callType: 'regular',
                    medium: 'VIDEOCONF'
                });

                // Emit offer with callId to recipient
                io.to(recipientSocketId).emit("offer", {
                    from: callerEmail,
                    offer,
                    callId: communication.callMetadata.callId
                });

                // Send callId back to caller
                socket.emit("callInitiated", {
                    callId: communication.callMetadata.callId,
                    recipientEmail: toEmail
                });

                console.log(`[CallUser] Call initiated from ${callerEmail} to ${toEmail}, callId: ${communication.callMetadata.callId}`);
            } catch (error) {
                console.error(`[CallUser] Error creating call history:`, error);
                // Still emit the offer even if history logging fails
                io.to(recipientSocketId).emit("offer", { from: callerEmail, offer });
            }
        } else {
            console.log(`[CallUser] User ${toEmail} is not connected`);
        }
    });
}

export default callUser;