import express from "express";
import AsteriskController from "../controllers/AsteriskController.js";

class AsteriskRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = AsteriskController;
    this.initializeRoutes();
  }

  initializeRoutes() {

    this.router.post("/addAsteriskCredentials", this.controller.addAddAsteriskCredentials)
    this.router.get("/getInactiveAgent", this.controller.getInactiveAgent)
    this.router.get("/getActiveAgentAndInactiveCustomer", this.controller.getActiveAgentAndInactiveCustomer)
    this.router.patch("/agent/:id/inactive", this.controller.setAgentInactive);
  }

  getRouter() {
    return this.router;
  }
}

export default new AsteriskRoutes().getRouter();