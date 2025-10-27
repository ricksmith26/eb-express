import express from "express";
import WebhookController from "../controllers/webhook-controller.js";

class WebhookRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // Google Calendar webhook endpoint
    // This will be called by Google when a user's calendar changes
    this.router.post("/google-calendar", WebhookController.handleGoogleCalendarWebhook);

    // Health check endpoint
    this.router.get("/health", WebhookController.healthCheck);
  }

  getRouter() {
    return this.router;
  }
}

export default new WebhookRoutes().getRouter();
