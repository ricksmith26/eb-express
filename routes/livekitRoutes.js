import express from "express";
import { getConnectionDetails } from "../controllers/livekitController.js";

const router = express.Router();

// Route to get LiveKit connection details
router.get("/connect/:email", getConnectionDetails);

export default router;