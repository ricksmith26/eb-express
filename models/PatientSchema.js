import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const patientSchema = new mongoose.Schema({
  resourceType: { type: String, default: "Patient" },
  id: { type: String, unique: true, default: () => uuidv4() },
  name: [
    {
      use: { type: String, enum: ["usual", "official", "temp", "nickname", "anonymous", "old", "maiden"] },
      family: { type: String },
      given: [String]
    }
  ],
  gender: { type: String, enum: ["male", "female", "other", "unknown"] },
  birthDate: { type: String },
  address: [
    {
      line: [String],
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  ],
  telecom: [
    {
      system: { type: String, enum: ["phone", "fax", "email", "pager", "url", "sms", "other"] },
      value: String,
      use: { type: String, enum: ["home", "work", "temp", "old", "mobile"] }
    }
  ],
  active: { type: Boolean, default: true },

  // Managing organization (for multi-tenancy)
  managingOrganization: {
    reference: { type: String, index: true },  // 'Organization/{id}'
    display: String
  }
});

// Index for organization-scoped queries
patientSchema.index({ 'managingOrganization.reference': 1, active: 1 });

const Patient = mongoose.model('Patient', patientSchema, 'Patient');
export default Patient;
