import FhirCommunication from '../models/FhirCommunication.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing WebRTC call history using FHIR Communication resources
 */
class CallHistoryService {
  /**
   * Initialize a new call record when a call is initiated
   * @param {Object} callData - Call initialization data
   * @returns {Promise<Object>} Created FHIR Communication record
   */
  async initiateCall(callData) {
    const {
      callerId,
      callerEmail,
      callerName,
      recipientId,
      recipientEmail,
      recipientName,
      socketIds,
      isEmergency = false,
      callType = 'regular',
      medium = 'VIDEOCONF'
    } = callData;

    const callId = uuidv4();

    const communication = new FhirCommunication({
      resourceType: 'Communication',
      status: 'preparation',

      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/communication-category',
          code: isEmergency ? 'alert' : 'notification',
          display: isEmergency ? 'Alert' : 'Notification'
        }],
        text: isEmergency ? 'Emergency WebRTC Call' : 'WebRTC Call'
      }],

      medium: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
          code: medium,
          display: this._getMediumDisplay(medium)
        }],
        text: this._getMediumDisplay(medium)
      }],

      sender: {
        reference: callerId ? `User/${callerId}` : undefined,
        identifier: {
          system: 'email',
          value: callerEmail
        },
        display: callerName || callerEmail
      },

      recipient: [{
        reference: recipientId ? `User/${recipientId}` : undefined,
        identifier: {
          system: 'email',
          value: recipientEmail
        },
        display: recipientName || recipientEmail
      }],

      sent: new Date(),

      callMetadata: {
        callId,
        socketIds: {
          caller: socketIds?.caller,
          recipient: socketIds?.recipient
        },
        callType,
        isEmergency,
        callDuration: 0
      }
    });

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Call initiated: ${callId} from ${callerEmail} to ${recipientEmail}`);

    return savedCommunication;
  }

  /**
   * Update call status when recipient answers
   * @param {String} callId - Unique call identifier
   * @param {Date} receivedTime - Time when call was answered
   * @returns {Promise<Object>} Updated FHIR Communication record
   */
  async acceptCall(callId, receivedTime = new Date()) {
    const communication = await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });

    if (!communication) {
      throw new Error(`Call not found: ${callId}`);
    }

    communication.status = 'in-progress';
    communication.received = receivedTime;

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Call accepted: ${callId}`);

    return savedCommunication;
  }

  /**
   * End a call and mark as completed
   * @param {String} callId - Unique call identifier
   * @param {Object} endData - Call ending data
   * @returns {Promise<Object>} Updated FHIR Communication record
   */
  async endCall(callId, endData = {}) {
    const {
      endReason = 'completed',
      connectionQuality,
      notes
    } = endData;

    const communication = await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });

    if (!communication) {
      throw new Error(`Call not found: ${callId}`);
    }

    // Calculate duration if call was answered
    if (communication.received) {
      communication.calculateDuration();
    }

    communication.status = endReason === 'completed' ? 'completed' : 'stopped';
    communication.callMetadata.endReason = endReason;

    if (connectionQuality) {
      communication.callMetadata.connectionQuality = connectionQuality;
    }

    if (notes) {
      communication.payload = [{
        contentString: notes
      }];
    }

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Call ended: ${callId}, duration: ${communication.callMetadata.callDuration}s, reason: ${endReason}`);

    return savedCommunication;
  }

  /**
   * Mark a call as rejected by the recipient
   * @param {String} callId - Unique call identifier
   * @returns {Promise<Object>} Updated FHIR Communication record
   */
  async rejectCall(callId) {
    const communication = await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });

    if (!communication) {
      throw new Error(`Call not found: ${callId}`);
    }

    communication.status = 'not-done';
    communication.callMetadata.endReason = 'rejected';

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Call rejected: ${callId}`);

    return savedCommunication;
  }

  /**
   * Mark a call as missed
   * @param {String} callId - Unique call identifier
   * @param {String} reason - Reason for missing (missed, timeout, error)
   * @returns {Promise<Object>} Updated FHIR Communication record
   */
  async missedCall(callId, reason = 'missed') {
    const communication = await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });

    if (!communication) {
      throw new Error(`Call not found: ${callId}`);
    }

    communication.status = 'not-done';
    communication.callMetadata.endReason = reason;

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Call ${reason}: ${callId}`);

    return savedCommunication;
  }

  /**
   * Get call history for a specific user
   * @param {String} userEmail - User email address
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of FHIR Communication records
   */
  async getUserCallHistory(userEmail, filters = {}) {
    const {
      status,
      isEmergency,
      startDate,
      endDate,
      limit = 100,
      skip = 0
    } = filters;

    const query = {
      $or: [
        { 'sender.identifier.value': userEmail },
        { 'recipient.identifier.value': userEmail }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (isEmergency !== undefined) {
      query['callMetadata.isEmergency'] = isEmergency;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    return await FhirCommunication.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
  }

  /**
   * Get call statistics for a user
   * @param {String} userEmail - User email address
   * @param {String} startDate - Start date for stats
   * @param {String} endDate - End date for stats
   * @returns {Promise<Object>} Call statistics
   */
  async getUserCallStats(userEmail, startDate, endDate) {
    const stats = await FhirCommunication.getCallStats(userEmail, startDate, endDate);

    const totalCalls = stats.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = stats.reduce((sum, stat) => sum + (stat.totalDuration || 0), 0);

    return {
      totalCalls,
      totalDuration,
      averageDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
      byStatus: stats
    };
  }

  /**
   * Find a call by callId
   * @param {String} callId - Unique call identifier
   * @returns {Promise<Object>} FHIR Communication record
   */
  async getCallById(callId) {
    return await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });
  }

  /**
   * Find a call by Socket.IO ID
   * @param {String} socketId - Socket.IO ID
   * @returns {Promise<Object>} FHIR Communication record
   */
  async getCallBySocketId(socketId) {
    return await FhirCommunication.findOne({
      $or: [
        { 'callMetadata.socketIds.caller': socketId },
        { 'callMetadata.socketIds.recipient': socketId }
      ],
      status: { $in: ['preparation', 'in-progress'] }
    }).sort({ createdAt: -1 });
  }

  /**
   * Helper method to get medium display text
   * @private
   */
  _getMediumDisplay(medium) {
    const displays = {
      'VERBAL': 'Voice Call',
      'VIDEOCONF': 'Video Conference',
      'ELECTRONIC': 'Electronic Communication'
    };
    return displays[medium] || 'Communication';
  }
}

export default new CallHistoryService();
