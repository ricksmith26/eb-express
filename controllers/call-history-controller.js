import callHistoryService from '../services/call-history-service.js';

class CallHistoryController {
  constructor() {
    // Bind methods to `this` so they retain context in routers
    this.getMyCallHistory = this.getMyCallHistory.bind(this);
    this.getUserCallHistory = this.getUserCallHistory.bind(this);
    this.getCallById = this.getCallById.bind(this);
    this.getMyCallStats = this.getMyCallStats.bind(this);
    this.getUserCallStats = this.getUserCallStats.bind(this);
    this.getFhirCallHistory = this.getFhirCallHistory.bind(this);
    this.createTwilioCall = this.createTwilioCall.bind(this);
    this.addCallNotes = this.addCallNotes.bind(this);
    this.endCall = this.endCall.bind(this);
    this.getCallHistoryByPhone = this.getCallHistoryByPhone.bind(this);
    this.getCallHistoryByPatient = this.getCallHistoryByPatient.bind(this);
    this.createPatientNote = this.createPatientNote.bind(this);
    this.getPatientCommunications = this.getPatientCommunications.bind(this);
  }

  /**
   * Get call history for the authenticated user
   */
  async getMyCallHistory(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const {
        status,
        isEmergency,
        startDate,
        endDate,
        limit = 100,
        skip = 0
      } = req.query;

      const filters = {
        status,
        isEmergency: isEmergency === 'true' ? true : isEmergency === 'false' ? false : undefined,
        startDate,
        endDate,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };

      const callHistory = await callHistoryService.getUserCallHistory(userEmail, filters);

      res.status(200).json({
        success: true,
        count: callHistory.length,
        data: callHistory
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching call history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call history',
        error: error.message
      });
    }
  }

  /**
   * Get call history for a specific user (by email)
   */
  async getUserCallHistory(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email parameter is required'
        });
      }

      const {
        status,
        isEmergency,
        startDate,
        endDate,
        limit = 100,
        skip = 0
      } = req.query;

      const filters = {
        status,
        isEmergency: isEmergency === 'true' ? true : isEmergency === 'false' ? false : undefined,
        startDate,
        endDate,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };

      const callHistory = await callHistoryService.getUserCallHistory(email, filters);

      res.status(200).json({
        success: true,
        count: callHistory.length,
        data: callHistory
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching user call history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call history',
        error: error.message
      });
    }
  }

  /**
   * Get a specific call by ID
   */
  async getCallById(req, res) {
    try {
      const { callId } = req.params;

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: 'Call ID parameter is required'
        });
      }

      const call = await callHistoryService.getCallById(callId);

      if (!call) {
        return res.status(404).json({
          success: false,
          message: 'Call not found'
        });
      }

      res.status(200).json({
        success: true,
        data: call
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching call:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call',
        error: error.message
      });
    }
  }

  /**
   * Get call statistics for the authenticated user
   */
  async getMyCallStats(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const { startDate, endDate } = req.query;

      const stats = await callHistoryService.getUserCallStats(userEmail, startDate, endDate);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching call stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call statistics',
        error: error.message
      });
    }
  }

  /**
   * Get call statistics for a specific user
   */
  async getUserCallStats(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email parameter is required'
        });
      }

      const { startDate, endDate } = req.query;

      const stats = await callHistoryService.getUserCallStats(email, startDate, endDate);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching user call stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call statistics',
        error: error.message
      });
    }
  }

  /**
   * Get FHIR-formatted call history (returns pure FHIR Communication resources)
   */
  async getFhirCallHistory(req, res) {
    try {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res.status(401).json({
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'security',
            diagnostics: 'User not authenticated'
          }]
        });
      }

      const {
        status,
        isEmergency,
        startDate,
        endDate,
        limit = 100,
        skip = 0
      } = req.query;

      const filters = {
        status,
        isEmergency: isEmergency === 'true' ? true : isEmergency === 'false' ? false : undefined,
        startDate,
        endDate,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };

      const callHistory = await callHistoryService.getUserCallHistory(userEmail, filters);

      // Return as FHIR Bundle
      const bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: callHistory.length,
        entry: callHistory.map(call => ({
          fullUrl: `Communication/${call._id}`,
          resource: call.toObject()
        }))
      };

      res.status(200).json(bundle);
    } catch (error) {
      console.error('[CallHistory] Error fetching FHIR call history:', error);
      res.status(500).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'exception',
          diagnostics: error.message
        }]
      });
    }
  }

  /**
   * Create a call record for Twilio/phone calls
   * POST /call-history/twilio
   * Body: { callerPhone, recipientPhone, direction, isEmergency, ... }
   */
  async createTwilioCall(req, res) {
    try {
      const {
        callerPhone,
        callerEmail,
        callerName,
        recipientPhone,
        recipientName,
        recipientEmail,
        direction,
        isEmergency,
        callType,
        asteriskChannel,
        recordingKey
      } = req.body;

      // Require at least one of callerPhone or callerEmail
      if ((!callerPhone && !callerEmail) || !direction) {
        return res.status(400).json({
          success: false,
          message: 'callerPhone or callerEmail and direction are required'
        });
      }

      const result = await callHistoryService.initiateTwilioCall({
        callerPhone,
        callerEmail,
        callerName,
        recipientPhone,
        recipientName,
        recipientEmail,
        direction,
        isEmergency,
        callType,
        asteriskChannel,
        recordingKey
      });

      res.status(201).json({
        success: true,
        message: 'Call record created',
        data: {
          callId: result.communication.callMetadata.callId,
          communication: result.communication,
          patient: result.patient ? {
            id: result.patient.id || result.patient._id,
            name: `${result.patient.name?.[0]?.given?.[0] || ''} ${result.patient.name?.[0]?.family || ''}`.trim()
          } : null
        }
      });
    } catch (error) {
      console.error('[CallHistory] Error creating Twilio call:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating call record',
        error: error.message
      });
    }
  }

  /**
   * Add notes to an existing call
   * POST /call-history/:callId/notes
   * Body: { content, author }
   */
  async addCallNotes(req, res) {
    try {
      const { callId } = req.params;
      const { content, author } = req.body;

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: 'Call ID is required'
        });
      }

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Note content is required'
        });
      }

      // Use authenticated user as author if not provided
      const noteAuthor = author || req.user?.email || 'Agent';

      const communication = await callHistoryService.addCallNotes(callId, {
        content,
        author: noteAuthor
      });

      res.status(200).json({
        success: true,
        message: 'Notes added to call',
        data: communication
      });
    } catch (error) {
      console.error('[CallHistory] Error adding notes:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error adding notes',
        error: error.message
      });
    }
  }

  /**
   * End a call and update status
   * POST /call-history/:callId/end
   * Body: { endReason, notes, connectionQuality }
   */
  async endCall(req, res) {
    try {
      const { callId } = req.params;
      const { endReason, notes, connectionQuality } = req.body;

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: 'Call ID is required'
        });
      }

      const communication = await callHistoryService.endCall(callId, {
        endReason,
        notes,
        connectionQuality
      });

      res.status(200).json({
        success: true,
        message: 'Call ended',
        data: communication
      });
    } catch (error) {
      console.error('[CallHistory] Error ending call:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error ending call',
        error: error.message
      });
    }
  }

  /**
   * Get call history by phone number
   * GET /call-history/phone/:phone
   */
  async getCallHistoryByPhone(req, res) {
    try {
      const { phone } = req.params;
      const { limit = 50, skip = 0 } = req.query;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const callHistory = await callHistoryService.getCallHistoryByPhone(phone, {
        limit: parseInt(limit),
        skip: parseInt(skip)
      });

      res.status(200).json({
        success: true,
        count: callHistory.length,
        data: callHistory
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching call history by phone:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call history',
        error: error.message
      });
    }
  }

  /**
   * Get call history by patient ID
   * GET /call-history/patient/:patientId
   */
  async getCallHistoryByPatient(req, res) {
    try {
      const { patientId } = req.params;
      const { limit = 50, skip = 0 } = req.query;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: 'Patient ID is required'
        });
      }

      const callHistory = await callHistoryService.getCallHistoryByPatient(patientId, {
        limit: parseInt(limit),
        skip: parseInt(skip)
      });

      res.status(200).json({
        success: true,
        count: callHistory.length,
        data: callHistory
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching call history by patient:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching call history',
        error: error.message
      });
    }
  }

  /**
   * Create a patient note (Communication without call context)
   * POST /call-history/patient/:patientId/note
   * Body: { content, noteType }
   */
  async createPatientNote(req, res) {
    try {
      const { patientId } = req.params;
      const { content, noteType = 'note', patientName, author: bodyAuthor } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: 'Patient ID is required'
        });
      }

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Note content is required'
        });
      }

      // Get author from request body first, fallback to user object
      const author = bodyAuthor || req.user?.fullName || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Agent';
      const authorEmail = req.user?.email;

      const communication = await callHistoryService.createPatientNote({
        patientId,
        patientName,
        content,
        author,
        authorEmail,
        noteType
      });

      res.status(201).json({
        success: true,
        message: 'Note created',
        data: {
          id: communication._id,
          communicationId: communication.callMetadata.callId,
          type: noteType,
          content,
          author,
          timestamp: communication.sent
        }
      });
    } catch (error) {
      console.error('[CallHistory] Error creating patient note:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating note',
        error: error.message
      });
    }
  }

  /**
   * Get all communications for a patient (calls + notes + device activity)
   * GET /call-history/patient/:patientId/communications
   */
  async getPatientCommunications(req, res) {
    try {
      const { patientId } = req.params;
      const { limit = 100, skip = 0, types } = req.query;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: 'Patient ID is required'
        });
      }

      // Parse types if provided as comma-separated string
      const typeArray = types ? types.split(',').map(t => t.trim()) : undefined;

      const result = await callHistoryService.getPatientCommunications(patientId, {
        limit: parseInt(limit),
        skip: parseInt(skip),
        types: typeArray
      });

      res.status(200).json({
        success: true,
        total: result.total,
        data: result.items
      });
    } catch (error) {
      console.error('[CallHistory] Error fetching patient communications:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching communications',
        error: error.message
      });
    }
  }
}

export default new CallHistoryController();
