import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  resourceType: { type: String, default: "Patient" },
  id: { type: String, required: true, unique: true },
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
  active: { type: Boolean, default: true }
});

const Patient = mongoose.model('Patient', patientSchema, 'Patient');
export default Patient;
