import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const PatientMediaSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  patientId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["photo", "video"],
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  s3Bucket: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "deleted"],
    default: "pending",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  uploadedBy: {
    type: String,
    required: true,
  },
});

PatientMediaSchema.index({ patientId: 1, uploadedAt: -1 });

const PatientMedia = mongoose.model("PatientMedia", PatientMediaSchema);

export default PatientMedia;
