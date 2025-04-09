import express from "express";
import WebRTCController from "../controllers/WebRTCController.js";

class WebRTCRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = WebRTCController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // 📡 WebRTC Signaling Message
    this.router.post("/", this.controller.sendWebRTCReq);

    // 🚨 Emergency Call
    this.router.post("/emergencyCall", this.controller.emergencyCallReq);
  }

  getRouter() {
    return this.router;
  }
}

export default new WebRTCRoutes().getRouter();