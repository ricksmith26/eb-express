import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

// CodeableConcept Schema (FHIR R4)
const CodeableConceptSchema = new mongoose.Schema({
  coding: [{
    system: String,
    code: String,
    display: String,
  }],
  text: String,
}, { _id: false });

// Reference Schema
const ReferenceSchema = new mongoose.Schema({
  reference: { type: String, required: true }, // e.g., "Patient/12345"
  display: String,
}, { _id: false });

// Reaction Schema (FHIR R4 AllergyIntolerance.reaction)
const ReactionSchema = new mongoose.Schema({
  substance: CodeableConceptSchema,
  manifestation: [CodeableConceptSchema],
  severity: {
    type: String,
    enum: ["mild", "moderate", "severe"],
  },
  onset: Date,
  note: [{
    text: String,
    time: Date,
  }],
}, { _id: false });

// Main AllergyIntolerance Schema (FHIR R4)
const AllergyIntoleranceSchema = new mongoose.Schema({
  resourceType: { type: String, default: "AllergyIntolerance", immutable: true },
  id: { type: String, unique: true, default: () => uuidv4() },

  // Clinical Status (active | inactive | resolved)
  clinicalStatus: {
    type: CodeableConceptSchema,
    default: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
        code: "active",
        display: "Active"
      }]
    }
  },

  // Verification Status (unconfirmed | confirmed | refuted | entered-in-error)
  verificationStatus: {
    type: CodeableConceptSchema,
    default: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
        code: "unconfirmed",
        display: "Unconfirmed"
      }]
    }
  },

  // Type (allergy | intolerance)
  type: {
    type: String,
    enum: ["allergy", "intolerance"],
  },

  // Category (food | medication | environment | biologic)
  category: [{
    type: String,
    enum: ["food", "medication", "environment", "biologic"],
  }],

  // Criticality (low | high | unable-to-assess)
  criticality: {
    type: String,
    enum: ["low", "high", "unable-to-assess"],
  },

  // Code - the substance/product that causes the allergy (SNOMED CT preferred)
  code: {
    type: CodeableConceptSchema,
    required: true,
  },

  // Patient reference (required)
  patient: {
    type: ReferenceSchema,
    required: true,
  },

  // Onset
  onsetDateTime: Date,
  onsetString: String,

  // Recorded date
  recordedDate: { type: Date, default: Date.now },

  // Recorder (who recorded)
  recorder: ReferenceSchema,

  // Asserter (who asserted)
  asserter: ReferenceSchema,

  // Last occurrence
  lastOccurrence: Date,

  // Note
  note: [{
    authorReference: ReferenceSchema,
    authorString: String,
    time: Date,
    text: String,
  }],

  // Reaction details
  reaction: [ReactionSchema],

}, { timestamps: true });

// Indexes
AllergyIntoleranceSchema.index({ "patient.reference": 1 });
AllergyIntoleranceSchema.index({ "code.coding.code": 1 });
AllergyIntoleranceSchema.index({ "clinicalStatus.coding.code": 1 });
AllergyIntoleranceSchema.index({ criticality: 1 });

const AllergyIntolerance = mongoose.model("AllergyIntolerance", AllergyIntoleranceSchema, "AllergyIntolerance");

export default AllergyIntolerance;
