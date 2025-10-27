import express from "express";
import LivekitController from "../controllers/livekit-controller.js";

class LivekitRoutes {
  constructor() {
    this.router = express.Router();
    this.livekitController = LivekitController; // Using LivekitController class instance
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/connect/:email/:message?", this.livekitController.getConnectionDetails);
  }

  getRouter() {
    return this.router;
  }
}

export default new LivekitRoutes().getRouter();