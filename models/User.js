import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, unique: true, required: true },
  picture: String,
  accessToken: String, // Google OAuth access token
  refreshToken: String, // Google OAuth refresh token (for Google APIs)
  jwtRefreshToken: String, // JWT refresh token (for keeping user logged into YOUR API)
  jwtRefreshTokenExpiry: Date, // When the JWT refresh token expires
  calendarChannelId: String, // For Google Calendar webhook notifications
  calendarResourceId: String, // For Google Calendar webhook notifications
  calendarChannelExpiration: Date, // When the webhook subscription expires
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);