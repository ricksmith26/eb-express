import { google } from "googleapis";
import { jwtDecode } from "jwt-decode";
import dotenv from "dotenv";
import fs from "fs";
import User from "../models/User.js";
import { API_URL, dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

class ImagesController {
  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    // 🔒 Bind methods to the class instance
    this.getAllImages = this.getAllImages.bind(this);
    this.getImage = this.getImage.bind(this);
    this.getBackUpImages = this.getBackUpImages.bind(this);
  }

  async getDriveInstance(user) {
    this.auth.setCredentials({ refresh_token: user.refreshToken });
    google.options({ auth: this.auth });
    return google.drive({ version: "v3", auth: this.auth });
  }

  async getBackUpImages() {
    const email = 'kevinsmith262626@gmail.com';
    const user = await User.findOne({ email });
    const drive = await this.getDriveInstance(user);

    const folderRes = await drive.files.list({
      q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
      fields: "files(id)",
    });

    const folderId = folderRes.data.files[0]?.id;
    if (!folderId) return [];

    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/'`,
      fields: "files(id, name, mimeType)",
    });

    return response.data.files.map(file => `${API_URL}/images/image/${file.id}/${email}`);
  }

  async getAllImages(req, res) {
    try {
      const decoded = jwtDecode(req.headers.authorization.replace('Bearer ', ''));
      const email = decoded.email;
      const user = await User.findOne({ email });
      const drive = await this.getDriveInstance(user);

      const folderRes = await drive.files.list({
        q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
        fields: "files(id)",
      });

      if (!folderRes.data.files.length) {
        const backup = await this.getBackUpImages();
        return res.json({ images: backup });
      }

      const folderId = folderRes.data.files[0].id;
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'image/'`,
        fields: "files(id, name, mimeType)",
      });

      const files = response.data.files.map(file => `${API_URL}/images/image/${file.id}/${email}`);
      console.log("📸 Files:", files);
      res.json({ images: files });
    } catch (error) {
      console.error("❌ Error fetching images:", error);
      res.status(500).json({ error: "Failed to retrieve images" });
    }
  }

  async getImage(req, res) {
    try {
      const { email, fileId } = req.params;
      const user = await User.findOne({ email });
      const drive = await this.getDriveInstance(user);

      const response = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );

      res.setHeader("Content-Type", "image/jpeg");
      response.data.pipe(res);
    } catch (error) {
      console.error("🚨 Error fetching image:", error);
      res.status(500).json({ error: "Failed to retrieve image" });
    }
  }
}

export default new ImagesController();