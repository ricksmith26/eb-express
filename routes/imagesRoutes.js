import express from "express";
import dotenv from "dotenv";
import ImagesController from "../controllers/imagesController.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class ImagesRoutes {
  constructor() {
    this.router = express.Router();
    this.imagesController = ImagesController; // Assumes a singleton export

    this.initializeRoutes();
  }

  initializeRoutes() {
    // ✅ Get a single image by file ID and user email (public access via email param)
    this.router.get("/image/:fileId/:email", this.imagesController.getImage);

    // ✅ Get all images for authenticated user (protected route)
    this.router.get("/all", verifyAccessToken, this.imagesController.getAllImages);
  }

  getRouter() {
    return this.router;
  }
}

export default new ImagesRoutes().getRouter();