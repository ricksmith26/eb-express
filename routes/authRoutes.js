import express from "express";
import dotenv from "dotenv";
import AuthController from "../controllers/auth-controller.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class AuthRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = AuthController;
    this.initializeRoutes();
  }

  initializeRoutes() {
    // OAuth routes
    this.router.get("/google", this.controller.googleLogin);
    this.router.get("/google/callback", this.controller.googleCallback);

    // Token management
    this.router.post("/refresh", this.controller.refreshToken);

    // Protected routes (require valid access token)
    this.router.get("/me", verifyAccessToken, this.controller.getMe);

    // Logout
    this.router.get("/logout", this.controller.logout);
  }

  getRouter() {
    return this.router;
  }
}

export default new AuthRoutes().getRouter();