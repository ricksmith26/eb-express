import express from "express";
import dotenv from "dotenv";
import QueueController from "../controllers/QueueController.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class QueueRoutes {
    constructor() {
        this.router = express.Router();
        this.controller = QueueController;

        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post("/addAgent", this.controller.addAgentToQueue);
        this.router.post("/addCustomer", this.controller.addCustomerToQueue)
    }

    getRouter() {
        return this.router;
    }
}

export default new QueueRoutes().getRouter();