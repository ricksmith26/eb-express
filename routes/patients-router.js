import express from "express";
import dotenv from "dotenv";
import PatientController from "../controllers/patientController.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class PatientRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = PatientController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // Protected route - requires JWT authentication
    this.router.get("/email", verifyAccessToken, this.controller.getPatientByEmail);

    // Public/admin routes (you may want to add auth here too)
    this.router.get("/", this.controller.getPatients);
    this.router.post("/", this.controller.createPatient);
    this.router.put("/:id", this.controller.updatePatient);
    this.router.delete("/:id", this.controller.deletePatient);
  }

  getRouter() {
    return this.router;
  }
}

export default new PatientRoutes().getRouter();