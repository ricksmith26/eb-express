import express from "express";
import dotenv from "dotenv";
import ImagesController from "../controllers/ImagesController.js"; // make sure the filename matches
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class ImagesRoutes {
  constructor() {
    this.router = express.Router();
    this.imagesController = ImagesController; // Assumes a singleton export

    this.initializeRoutes();
  }

  initializeRoutes() {
    // ✅ Get a single image by file ID and user email
    this.router.get("/image/:fileId/:email", this.imagesController.getImage);

    // ✅ Get all images for authenticated user
    this.router.get("/all", this.imagesController.getAllImages);
  }

  getRouter() {
    return this.router;
  }
}

export default new ImagesRoutes().getRouter();