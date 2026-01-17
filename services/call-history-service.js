import FhirCommunication from '../models/FhirCommunication.js';
import Patient from '../models/PatientSchema.js';
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

  /**
   * Lookup patient by phone number
   * @param {String} phone - Phone number to lookup
   * @returns {Promise<Object|null>} Patient record or null
   */
  async _lookupPatientByPhone(phone) {
    if (!phone) return null;

    // Generate phone number variants (UK international and local formats)
    const phoneVariants = [phone];

    if (phone.startsWith('+44')) {
      // Convert +447939043476 to 07939043476
      phoneVariants.push('0' + phone.slice(3));
    } else if (phone.startsWith('0') && phone.length === 11) {
      // Convert 07939043476 to +447939043476
      phoneVariants.push('+44' + phone.slice(1));
    }

    return await Patient.findOne({
      telecom: {
        $elemMatch: {
          system: "phone",
          value: { $in: phoneVariants }
        }
      }
    });
  }

  /**
   * Lookup patient by email address
   * @param {String} email - Email address to lookup
   * @returns {Promise<Object|null>} Patient record or null
   */
  async _lookupPatientByEmail(email) {
    if (!email) return null;

    return await Patient.findOne({
      telecom: {
        $elemMatch: {
          system: "email",
          value: email
        }
      }
    });
  }

  /**
   * Initialize a call record for Twilio/phone calls
   * Automatically looks up patient by phone number and links if found
   * @param {Object} callData - Call initialization data
   * @returns {Promise<Object>} Created FHIR Communication record
   */
  async initiateTwilioCall(callData) {
    const {
      callerPhone,
      callerEmail,    // Caller email (for SIP/web calls)
      callerName,
      recipientPhone,
      recipientName,
      recipientEmail,  // Agent email if known
      direction,       // 'inbound' or 'outbound'
      isEmergency = false,
      callType = 'regular',
      asteriskChannel,
      recordingKey
    } = callData;

    const callId = uuidv4();

    // Determine customer phone/email (the external party)
    const customerPhone = direction === 'inbound' ? callerPhone : recipientPhone;
    const customerEmail = direction === 'inbound' ? callerEmail : null;

    // Try to lookup patient by phone first, then by email
    let patient = await this._lookupPatientByPhone(customerPhone);
    console.log(`[CallHistory] Phone lookup for ${customerPhone}: ${patient ? patient._id : 'not found'}`);
    if (!patient && customerEmail) {
      patient = await this._lookupPatientByEmail(customerEmail);
      console.log(`[CallHistory] Email lookup for ${customerEmail}: ${patient ? patient._id : 'not found'}`);
    }
    const patientName = patient
      ? `${patient.name?.[0]?.given?.[0] || ''} ${patient.name?.[0]?.family || ''}`.trim()
      : null;

    // Build sender and recipient based on direction
    let sender, recipient, subject;

    if (direction === 'inbound') {
      // Inbound: Customer called us
      // Use phone if available, otherwise email
      const senderSystem = callerPhone ? 'phone' : 'email';
      const senderValue = callerPhone || callerEmail;
      sender = {
        identifier: {
          system: senderSystem,
          value: senderValue
        },
        display: patientName || callerName || senderValue
      };
      recipient = [{
        identifier: {
          system: recipientEmail ? 'email' : 'phone',
          value: recipientEmail || recipientPhone
        },
        display: recipientName || recipientEmail || recipientPhone
      }];
    } else {
      // Outbound: We called customer
      sender = {
        identifier: {
          system: recipientEmail ? 'email' : 'extension',
          value: recipientEmail || callerPhone
        },
        display: callerName || callerPhone
      };
      recipient = [{
        identifier: {
          system: 'phone',
          value: recipientPhone
        },
        display: patientName || recipientName || recipientPhone
      }];
    }

    // Link to patient if found
    if (patient) {
      subject = {
        reference: `Patient/${patient.id || patient._id}`,
        display: patientName
      };
    }

    const communication = new FhirCommunication({
      resourceType: 'Communication',
      status: 'in-progress',

      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/communication-category',
          code: isEmergency ? 'alert' : 'notification',
          display: isEmergency ? 'Alert' : 'Notification'
        }],
        text: isEmergency ? 'Emergency Phone Call' : 'Phone Call'
      }],

      medium: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
          code: 'VERBAL',
          display: 'Voice Call'
        }],
        text: 'Phone Call via Twilio'
      }],

      sender,
      recipient,
      subject,

      sent: new Date(),
      received: new Date(),  // For phone calls, answer time is now

      callMetadata: {
        callId,
        callType,
        isEmergency,
        callDuration: 0,
        direction,
        asteriskChannel,
        recordingKey
      }
    });

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Twilio call initiated: ${callId}, direction: ${direction}, patient: ${patient ? patient._id : 'unknown'}`);

    return {
      communication: savedCommunication,
      patient
    };
  }

  /**
   * Add notes to an existing call
   * @param {String} callId - Unique call identifier
   * @param {Object} noteData - Note data
   * @returns {Promise<Object>} Updated FHIR Communication record
   */
  async addCallNotes(callId, noteData) {
    const {
      content,
      author,
      timestamp = new Date()
    } = noteData;

    const communication = await FhirCommunication.findOne({
      'callMetadata.callId': callId
    });

    if (!communication) {
      throw new Error(`Call not found: ${callId}`);
    }

    // Initialize payload array if needed
    if (!communication.payload) {
      communication.payload = [];
    }

    // Find or create notes entry
    let notesEntry = communication.payload.find(p => p.contentString !== undefined);

    if (notesEntry) {
      // Append to existing notes with timestamp
      const newNote = `\n[${timestamp.toISOString()}] ${author || 'Agent'}: ${content}`;
      notesEntry.contentString = (notesEntry.contentString || '') + newNote;
    } else {
      // Create new notes entry
      communication.payload.push({
        contentString: `[${timestamp.toISOString()}] ${author || 'Agent'}: ${content}`
      });
    }

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Notes added to call: ${callId}`);

    return savedCommunication;
  }

  /**
   * Get call history by phone number (for patient timeline)
   * @param {String} phone - Phone number
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of FHIR Communication records
   */
  async getCallHistoryByPhone(phone, filters = {}) {
    const { limit = 50, skip = 0 } = filters;

    // Generate phone number variants
    const phoneVariants = [phone];
    if (phone.startsWith('+44')) {
      phoneVariants.push('0' + phone.slice(3));
    } else if (phone.startsWith('0') && phone.length === 11) {
      phoneVariants.push('+44' + phone.slice(1));
    }

    return await FhirCommunication.find({
      $or: [
        { 'sender.identifier.value': { $in: phoneVariants } },
        { 'recipient.identifier.value': { $in: phoneVariants } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
  }

  /**
   * Get call history by patient ID
   * @param {String} patientId - Patient ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of FHIR Communication records
   */
  async getCallHistoryByPatient(patientId, filters = {}) {
    const { limit = 50, skip = 0 } = filters;

    return await FhirCommunication.find({
      'subject.reference': { $in: [`Patient/${patientId}`, patientId] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
  }

  /**
   * Create a patient note (Communication without call context)
   * Uses FHIR Communication with medium=WRITTEN
   * @param {Object} noteData - Note data
   * @returns {Promise<Object>} Created FHIR Communication record
   */
  async createPatientNote(noteData) {
    const {
      patientId,
      patientName,
      content,
      author,
      authorEmail,
      noteType = 'note' // 'note', 'alert', 'device-activity'
    } = noteData;

    const noteId = uuidv4();

    // Map note type to FHIR category
    const categoryMap = {
      'note': { code: 'notification', display: 'Notification', text: 'Patient Note' },
      'alert': { code: 'alert', display: 'Alert', text: 'Patient Alert' },
      'device-activity': { code: 'alert', display: 'Alert', text: 'Device Activity' }
    };
    const category = categoryMap[noteType] || categoryMap['note'];

    // Map note type to medium
    const mediumMap = {
      'note': { code: 'WRITTEN', display: 'Written', text: 'Manual Note' },
      'alert': { code: 'ELECTRONIC', display: 'Electronic', text: 'System Alert' },
      'device-activity': { code: 'ELECTRONIC', display: 'Electronic', text: 'Device Activity' }
    };
    const medium = mediumMap[noteType] || mediumMap['note'];

    const communication = new FhirCommunication({
      resourceType: 'Communication',
      status: 'completed',

      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/communication-category',
          code: category.code,
          display: category.display
        }],
        text: category.text
      }],

      medium: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
          code: medium.code,
          display: medium.display
        }],
        text: medium.text
      }],

      subject: {
        reference: `Patient/${patientId}`,
        display: patientName || undefined
      },

      sender: {
        identifier: {
          system: 'email',
          value: authorEmail
        },
        display: author || authorEmail
      },

      sent: new Date(),

      payload: [{
        contentString: content
      }],

      // Minimal callMetadata for consistency (no call-specific data)
      callMetadata: {
        callId: noteId,
        callType: noteType === 'note' ? 'manual' : noteType,
        isEmergency: false
      }
    });

    const savedCommunication = await communication.save();
    console.log(`[CallHistory] Patient note created: ${noteId} for patient ${patientId}, type: ${noteType}`);

    return savedCommunication;
  }

  /**
   * Get all communications for a patient (calls + notes + device activity)
   * @param {String} patientId - Patient ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Categorized communications
   */
  async getPatientCommunications(patientId, filters = {}) {
    const { limit = 100, skip = 0, types } = filters;

    // Build query to match various reference formats
    const patientRef = `Patient/${patientId}`;
    const query = {
      $or: [
        { 'subject.reference': patientRef },
        { 'subject.reference': patientId },
        { 'subject.reference.reference': patientRef }, // In case of nested object
        { 'subject.reference.reference': patientId }
      ]
    };

    // Filter by communication types if specified
    if (types && types.length > 0) {
      query['callMetadata.callType'] = { $in: types };
    }

    console.log('[CallHistory] Querying communications for patient:', patientId, 'Query:', JSON.stringify(query));

    const communications = await FhirCommunication.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    console.log('[CallHistory] Found communications:', communications.length);

    // Transform to a unified format for the frontend
    const items = communications.map(comm => {
      const isCall = ['regular', 'emergency', 'scheduled'].includes(comm.callMetadata?.callType);
      const noteContent = comm.payload?.[0]?.contentString || '';

      return {
        id: comm._id,
        communicationId: comm.callMetadata?.callId,
        type: comm.callMetadata?.callType || 'unknown',
        isCall,
        timestamp: comm.sent || comm.createdAt,
        author: comm.sender?.display || comm.sender?.identifier?.value || 'System',
        content: isCall ? this._parseCallNotes(noteContent) : noteContent,
        medium: comm.medium?.[0]?.coding?.[0]?.code || 'UNKNOWN',
        status: comm.status,
        // Call-specific fields
        direction: comm.callMetadata?.direction,
        duration: comm.callMetadata?.callDuration,
        endReason: comm.callMetadata?.endReason
      };
    });

    return {
      total: items.length,
      items
    };
  }

  /**
   * Parse call notes from concatenated string format
   * @private
   */
  _parseCallNotes(noteString) {
    if (!noteString) return [];

    // Notes are stored as: [timestamp] author: content
    const notePattern = /\[([^\]]+)\]\s*([^:]+):\s*(.+?)(?=\n\[|$)/gs;
    const notes = [];
    let match;

    while ((match = notePattern.exec(noteString)) !== null) {
      notes.push({
        timestamp: match[1],
        author: match[2].trim(),
        content: match[3].trim()
      });
    }

    // If no structured notes found, return as single note
    if (notes.length === 0 && noteString.trim()) {
      return [{ content: noteString.trim(), author: 'Unknown', timestamp: null }];
    }

    return notes;
  }
}

export default new CallHistoryService();
