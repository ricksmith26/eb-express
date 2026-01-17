import express from "express";
import ClinicalResourceController from "../controllers/clinicalResourceController.js";

class ClinicalResourceRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = ClinicalResourceController;
    this.initializeRoutes();
  }

  initializeRoutes() {
    // AllergyIntolerance routes
    this.router.get("/allergy-intolerance", this.controller.getAllergies);
    this.router.get("/allergy-intolerance/:id", this.controller.getAllergyById);
    this.router.post("/allergy-intolerance", this.controller.createAllergy);
    this.router.put("/allergy-intolerance/:id", this.controller.updateAllergy);
    this.router.delete("/allergy-intolerance/:id", this.controller.deleteAllergy);

    // Condition routes
    this.router.get("/condition", this.controller.getConditions);
    this.router.get("/condition/:id", this.controller.getConditionById);
    this.router.post("/condition", this.controller.createCondition);
    this.router.put("/condition/:id", this.controller.updateCondition);
    this.router.delete("/condition/:id", this.controller.deleteCondition);

    // MedicationStatement routes
    this.router.get("/medication-statement", this.controller.getMedications);
    this.router.get("/medication-statement/:id", this.controller.getMedicationById);
    this.router.post("/medication-statement", this.controller.createMedication);
    this.router.put("/medication-statement/:id", this.controller.updateMedication);
    this.router.delete("/medication-statement/:id", this.controller.deleteMedication);
  }

  getRouter() {
    return this.router;
  }
}

export default new ClinicalResourceRoutes().getRouter();
