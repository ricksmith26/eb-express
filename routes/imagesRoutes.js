import express from "express";
import { google } from "googleapis";
import {getAllImages, getImage} from '../controllers/imagesController.js'

const router = express.Router();

const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob" // Use "oob" for refresh tokens
  );

// Route to get LiveKit connection details
router.get("/image/:fileId/:email", getImage);

router.get("/all", getAllImages);

export default router;