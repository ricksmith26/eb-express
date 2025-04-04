import express from "express";
import { WebRTCController } from '../controllers/webRTCController.js'

const router = express.Router();

// Route to get LiveKit connection details
router.post("/", WebRTCController.sendWebRTCReq);
router.post("/emergencyCall", WebRTCController.emergencyCallReq);

export default router;