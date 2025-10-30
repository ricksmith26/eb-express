import express from "express";
import CallHistoryController from "../controllers/call-history-controller.js";
import { isAuth } from "../middleware/isAuth.js";

class CallHistoryRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = CallHistoryController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // Get call history for authenticated user
    // Query params: status, isEmergency, startDate, endDate, limit, skip
    this.router.get("/", isAuth, this.controller.getMyCallHistory);

    // Get FHIR-formatted call history
    this.router.get("/fhir", isAuth, this.controller.getFhirCallHistory);

    // Get call statistics for authenticated user
    // Query params: startDate, endDate
    this.router.get("/stats", isAuth, this.controller.getMyCallStats);

    // Get a specific call by callId
    this.router.get("/call/:callId", isAuth, this.controller.getCallById);

    // Get call history for a specific user by email
    // Query params: status, isEmergency, startDate, endDate, limit, skip
    this.router.get("/user/:email", isAuth, this.controller.getUserCallHistory);

    // Get call statistics for a specific user
    // Query params: startDate, endDate
    this.router.get("/stats/:email", isAuth, this.controller.getUserCallStats);
  }

  getRouter() {
    return this.router;
  }
}

export default new CallHistoryRoutes().getRouter();
