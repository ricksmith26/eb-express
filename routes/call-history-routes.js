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
  }

  getRouter() {
    return this.router;
  }
}

export default new CallHistoryRoutes().getRouter();
