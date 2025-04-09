import express from "express";
import dotenv from "dotenv";
import PatientController from "../controllers/PatientController.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class PatientRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = PatientController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/email", this.controller.getPatientByEmail); 
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