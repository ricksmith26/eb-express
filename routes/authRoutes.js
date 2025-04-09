import express from "express";
import dotenv from "dotenv";
import AuthController from "../controllers/AuthController.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class AuthRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = AuthController;
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/google", this.controller.googleLogin);
    this.router.get("/google/callback", this.controller.googleCallback);
    this.router.get("/logout", this.controller.logout);
    this.router.get("/me", this.controller.getMe);
  }

  getRouter() {
    return this.router;
  }
}

export default new AuthRoutes().getRouter();