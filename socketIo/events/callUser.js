import {getUserEmail, getPreferredSocketId, getUserConnections} from '../socketIo.js'
import callHistoryService from '../../services/call-history-service.js';
import User from '../../models/User.js';
import { sendCallNotification } from '../../services/pushNotificationService.js';

const callUser = (socket, users, io) => {
    socket.on("callUser", async ({ toEmail, offer, callerName, recipientName }) => {
        const callerEmail = getUserEmail(socket.id);

        // Use priority routing to get preferred socket ID (web first, then mobile)
        const recipientSocketId = getPreferredSocketId(toEmail);
        const recipientConnections = getUserConnections(toEmail);

        if (recipientSocketId) {
            // Find the device type of the preferred connection
            const preferredConnection = recipientConnections.find(conn => conn.socketId === recipientSocketId);
            const deviceType = preferredConnection ? preferredConnection.deviceType : 'unknown';

            console.log(`[CallUser] Routing call to ${toEmail} on ${deviceType} device (${recipientSocketId})`);
            console.log(`[CallUser] Available connections for ${toEmail}:`, recipientConnections.length);
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
            console.log(`[CallUser] User ${toEmail} is not connected - attempting push notification`);

            try {
                // User is offline - send push notification
                const recipient = await User.findOne({ email: toEmail });

                if (recipient && recipient.pushNotificationTokens && recipient.pushNotificationTokens.length > 0) {
                    console.log(`[CallUser] Sending push notification to ${toEmail} (${recipient.pushNotificationTokens.length} tokens)`);

                    // Create call history record for offline call
                    const communication = await callHistoryService.initiateCall({
                        callerEmail,
                        callerName: callerName || callerEmail,
                        recipientEmail: toEmail,
                        recipientName: recipientName || toEmail,
                        socketIds: {
                            caller: socket.id,
                            recipient: null  // No recipient socket since offline
                        },
                        isEmergency: false,
                        callType: 'regular',
                        medium: 'VIDEOCONF'
                    });

                    // Send push notification with call data
                    const tickets = await sendCallNotification(
                        recipient.pushNotificationTokens,
                        {
                            fromEmail: callerEmail,
                            fromName: callerName || callerEmail,
                            callId: communication.callMetadata.callId,
                            offer
                        }
                    );

                    // Send callId back to caller
                    socket.emit("callInitiated", {
                        callId: communication.callMetadata.callId,
                        recipientEmail: toEmail,
                        pushNotificationSent: true
                    });

                    console.log(`[CallUser] Push notification sent successfully, callId: ${communication.callMetadata.callId}`);
                } else {
                    console.log(`[CallUser] No push tokens registered for ${toEmail}`);
                }
            } catch (error) {
                console.error(`[CallUser] Error sending push notification:`, error);
            }
        }
    });
}

export default callUser;