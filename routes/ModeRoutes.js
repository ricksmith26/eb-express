import express from "express";
import dotenv from "dotenv";
import ModeController from "../controllers/ModeController.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class ModeRoutes {
  constructor() {
    this.router = express.Router();
    this.modeController = ModeController;

    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/", this.modeController.changeMode);
  }

  getRouter() {
    return this.router;
  }
}

export default new ModeRoutes().getRouter();