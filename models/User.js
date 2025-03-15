import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, unique: true, required: true },
  picture: String,
  accessToken: String,
  refreshToken: String, // ✅ Store refresh token
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);