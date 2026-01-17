import { Router } from "express";
import recordingController from "../controllers/recording-controller.js";

class RecordingRoutes {
  constructor() {
    this.router = Router();
    this.controller = recordingController;
    this.initializeRoutes();
  }

  initializeRoutes() {
    // List all recordings (with optional filters)
    // GET /recordings?date=20260117&direction=inbound&limit=50
    this.router.get("/", this.controller.listRecordings);

    // Get presigned download URL for a recording
    // GET /recordings/:key/download (key should be URL-encoded)
    this.router.get("/:key/download", this.controller.getRecordingDownloadUrl);

    // Attach a recording to a call
    // POST /recordings/attach { callId, s3Key }
    this.router.post("/attach", this.controller.attachRecordingToCall);

    // Get recording for a specific call
    // GET /recordings/call/:callId
    this.router.get("/call/:callId", this.controller.getCallRecording);

    // Find recordings that might match a call
    // GET /recordings/call/:callId/find
    this.router.get("/call/:callId/find", this.controller.findRecordingsForCall);

    // Delete a recording
    // DELETE /recordings/:key (key should be URL-encoded)
    this.router.delete("/:key", this.controller.deleteRecording);
  }

  getRouter() {
    return this.router;
  }
}

export default new RecordingRoutes().getRouter();
