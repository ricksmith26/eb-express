import express from "express";
import CallHistoryController from "../controllers/call-history-controller.js";

// Placeholder auth middleware - TODO: Replace with actual auth
const noAuth = (req, res, next) => {
  // Extract email from x-user-email header (sent by client on login)
  const userEmail = req.headers['x-user-email'] || 'test@example.com';
  req.user = { email: userEmail };
  next();
};

class CallHistoryRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = CallHistoryController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // Get call history for authenticated user
    // Query params: status, isEmergency, startDate, endDate, limit, skip
    this.router.get("/", noAuth, this.controller.getMyCallHistory);

    // Get FHIR-formatted call history
    this.router.get("/fhir", noAuth, this.controller.getFhirCallHistory);

    // Get call statistics for authenticated user
    // Query params: startDate, endDate
    this.router.get("/stats", noAuth, this.controller.getMyCallStats);

    // Get a specific call by callId
    this.router.get("/call/:callId", noAuth, this.controller.getCallById);

    // Get call history for a specific user by email
    // Query params: status, isEmergency, startDate, endDate, limit, skip
    this.router.get("/user/:email", noAuth, this.controller.getUserCallHistory);

    // Get call statistics for a specific user
    // Query params: startDate, endDate
    this.router.get("/stats/:email", noAuth, this.controller.getUserCallStats);

    // Create a Twilio call record (with automatic patient lookup)
    // Body: { callerPhone, callerName, recipientPhone, recipientName, recipientEmail, direction, isEmergency, callType, asteriskChannel, recordingKey }
    this.router.post("/twilio", noAuth, this.controller.createTwilioCall);

    // Add notes to a call
    // Body: { content, author }
    this.router.post("/:callId/notes", noAuth, this.controller.addCallNotes);

    // End a call
    // Body: { endReason, connectionQuality, notes }
    this.router.post("/:callId/end", noAuth, this.controller.endCall);

    // Get call history by phone number
    // Query params: limit, skip
    this.router.get("/phone/:phone", noAuth, this.controller.getCallHistoryByPhone);

    // Get all communications for a patient (calls + notes + device activity)
    // Query params: limit, skip, types (comma-separated: note,regular,emergency,device-activity)
    this.router.get("/patient/:patientId/communications", noAuth, this.controller.getPatientCommunications);

    // Create a patient note (Communication without call context)
    // Body: { content, noteType, patientName }
    this.router.post("/patient/:patientId/note", noAuth, this.controller.createPatientNote);

    // Get call history by patient ID (legacy - use /communications for unified view)
    // Query params: limit, skip
    this.router.get("/patient/:patientId", noAuth, this.controller.getCallHistoryByPatient);
  }

  getRouter() {
    return this.router;
  }
}

export default new CallHistoryRoutes().getRouter();
