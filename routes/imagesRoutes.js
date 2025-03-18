import express from "express";
import { google } from "googleapis";
import User from '../models/User.js'
import {API_URL} from '../config/vars.js'
import { jwtDecode } from "jwt-decode";

const router = express.Router();

const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob" // Use "oob" for refresh tokens
  );

// Route to get LiveKit connection details
router.get("/image/:fileId/:email", async (req, res) => {
    // const decoded = jwtDecode(req.headers.authorization.replace('Bearer ', ''));
    const email = req.params.email;
    const user = await User.findOne({ email });
    auth.setCredentials({ refresh_token: user.refreshToken });
    const drive = google.drive({ version: "v3", auth });
    try {
        const fileId = req.params.fileId;

        // ✅ Fetch the image from Google Drive
        const response = await drive.files.get(
            { fileId, alt: "media" },
            { responseType: "stream" }
        );
        res.setHeader("Content-Type", "image/jpeg");
        response.data.pipe(res); // ✅ Stream image directly
    } catch (error) {
        console.error("🚨 Error fetching image:", error);
        res.status(500).json({ error: "Failed to retrieve image" });
    }
});

router.get("/all", async (req, res) => {
    const decoded = jwtDecode(req.headers.authorization.replace('Bearer ', ''));
    const email = decoded.email;
    const user = await User.findOne({ email });
    auth.setCredentials({ refresh_token: user.refreshToken });
    google.options({ auth });
    const drive = google.drive({ version: "v3", auth });

    try {
        // Find "Brigid" folder
        const folderResponse = await drive.files.list({
            q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
            fields: "files(id)",
        });

        if (!folderResponse.data.files.length) {
            
            return res.json({ message: "Brigid folder not found" });
        }

        const folderId = folderResponse.data.files[0].id;

        // Get images inside "Brigid" folder
        const response = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/'`,
            fields: "files(id, name, mimeType)",
        });
        // ✅ Generate Secure Proxy URLs (Served via Express)
        const files = response.data.files.map((file) =>  `${API_URL}/images/image/${file.id}/${email}`); // ✅ Proxy URL
        console.log(files)
        res.json({ images: files });
    } catch (error) {
        console.error("Error fetching images:", error);
        res.status(500).json({ error: "Failed to retrieve images" });
    }
});

export default router;