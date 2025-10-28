import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import User from "../models/User.js";
import TokenController from "./token-controller.js";
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

  /**
   * Execute a Google API call with automatic token refresh on 401/403
   */
  async executeWithTokenRefresh(user, apiCall) {
    try {
      return await apiCall();
    } catch (error) {
      // Check if error is due to expired/invalid token
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log("🔄 Google token expired, refreshing...");

        // Refresh the Google OAuth access token
        const newAccessToken = await TokenController.refreshAccessToken(user);

        if (!newAccessToken) {
          throw new Error("Failed to refresh Google access token");
        }

        console.log("✅ Google token refreshed, retrying request...");

        // Retry the API call with new token
        return await apiCall();
      }

      // If not a token error, rethrow
      throw error;
    }
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
      // User is attached by verifyAccessToken middleware
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const drive = await this.getDriveInstance(user);

      // Wrap Google API calls with auto-refresh
      const result = await this.executeWithTokenRefresh(user, async () => {
        const folderRes = await drive.files.list({
          q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
          fields: "files(id)",
        });

        if (!folderRes.data.files.length) {
          const backup = await this.getBackUpImages();
          return { images: backup };
        }

        const folderId = folderRes.data.files[0].id;
        const response = await drive.files.list({
          q: `'${folderId}' in parents and mimeType contains 'image/'`,
          fields: "files(id, name, mimeType)",
        });

        const files = response.data.files.map(
          file => `${API_URL}/images/image/${file.id}/${user.email}`
        );

        return { images: files };
      });

      console.log("📸 Files:", result.images);
      res.json(result);
    } catch (error) {
      console.error("❌ Error fetching images:", error);
      res.status(500).json({ error: "Failed to retrieve images" });
    }
  }

  async getImage(req, res) {
    try {
      const { email, fileId } = req.params;
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const drive = await this.getDriveInstance(user);

      // Wrap Google API call with auto-refresh
      await this.executeWithTokenRefresh(user, async () => {
        const response = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "stream" }
        );

        res.setHeader("Content-Type", "image/jpeg");
        response.data.pipe(res);
      });
    } catch (error) {
      console.error("🚨 Error fetching image:", error);
      res.status(500).json({ error: "Failed to retrieve image" });
    }
  }
}

export default new ImagesController();