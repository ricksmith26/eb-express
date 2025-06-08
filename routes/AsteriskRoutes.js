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
    this.router.get("/getInactiveCustomer", this.controller.getInactiveCustomer)
    this.router.get("/getInactiveAgent", this.controller.getInactiveAgent)
    this.router.get("/all", this.controller.getAllAgents)
    this.router.get("/getActiveAgentAndInactiveCustomer", this.controller.getActiveAgentAndInactiveCustomer)
    this.router.patch("/agent/status/:id", this.controller.setAgentStatus);
  }

  getRouter() {
    return this.router;
  }
}

export default new AsteriskRoutes().getRouter();