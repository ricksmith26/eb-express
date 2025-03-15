import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  identity: { type: String, required: true, unique: true },
  roomName: { type: String, required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: "15m" }, // Auto-delete after 15 minutes
});

export default mongoose.model("Participant", participantSchema);