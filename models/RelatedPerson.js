import mongoose from "mongoose";

// Identifier Schema (UUID for each RelatedPerson)
const IdentifierSchema = new mongoose.Schema({
  system: String,
  value: String,
});

// Name Schema (FHIR-compliant HumanName)
const HumanNameSchema = new mongoose.Schema({
  family: { type: String, required: true },
  given: [{ type: String, required: true }],
});

// Telecom Schema (FHIR-compliant ContactPoint)
const ContactPointSchema = new mongoose.Schema({
  system: { type: String, enum: ["phone", "fax", "email", "pager", "url", "sms", "other"], required: true },
  value: { type: String, required: true },
  use: { type: String, enum: ["home", "work", "temp", "old", "mobile"] },
});

// Relationship Schema (FHIR-compliant CodeableConcept)
const CodeableConceptSchema = new mongoose.Schema({
  coding: [
    {
      system: { type: String, required: true },
      code: { type: String, required: true },
      display: String,
    },
  ],
});

// Patient Reference Schema
const ReferenceSchema = new mongoose.Schema({
  reference: { type: String, required: true }, // e.g., "Patient/12345"
});

// Main RelatedPerson Schema
const RelatedPersonSchema = new mongoose.Schema({
  id: { type: String, default: () => crypto.randomUUID() }, // Generate UUID
  resourceType: { type: String, default: "RelatedPerson" },
  name: { type: [HumanNameSchema], required: true }, // Array of HumanName
  telecom: { type: [ContactPointSchema], required: false }, // Array of ContactPoint
  relationship: { type: [CodeableConceptSchema], required: true }, // Array of Relationship codes
  patient: { type: ReferenceSchema, required: true }, // Reference to Patient
});

// Create Mongoose Model
const RelatedPerson = mongoose.model("RelatedPerson", RelatedPersonSchema);

export default RelatedPerson;