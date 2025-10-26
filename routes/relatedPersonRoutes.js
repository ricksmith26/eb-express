import express from "express";
import dotenv from "dotenv";
import RelatedPersonController from "../controllers/relatedPersonController.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class RelatedPersonRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = RelatedPersonController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    // Protected route - requires JWT authentication
    this.router.get("/getByEmail", verifyAccessToken, this.controller.getRelatedPersonsByPatientEmail);

    // Other routes (some may need auth too, depending on your requirements)
    this.router.get("/email/ai", this.controller.getRelatedPersonsByPatientEmailForAI);
    this.router.post("/", this.controller.createRelatedPerson);
    this.router.get("/:id", this.controller.getRelatedPerson);
    this.router.put("/:id", this.controller.updateRelatedPerson);
    this.router.delete("/:id", this.controller.deleteRelatedPerson);
    this.router.get("/", this.controller.getAllRelatedPersons);
  }

  getRouter() {
    return this.router;
  }
}

export default new RelatedPersonRoutes().getRouter();