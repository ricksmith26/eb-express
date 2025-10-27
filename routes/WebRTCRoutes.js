import express from "express";
import WebRTCController from "../controllers/webrtc-controller.js";

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

    this.router.post("/addAsteriskCredentials", this.controller.addAddAsteriskCredentials)
  }

  getRouter() {
    return this.router;
  }
}

export default new WebRTCRoutes().getRouter();