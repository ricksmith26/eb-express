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

// Period Schema
const PeriodSchema = new mongoose.Schema({
  start: Date,
  end: Date,
}, { _id: false });

// Stage Schema (FHIR R4 Condition.stage)
const StageSchema = new mongoose.Schema({
  summary: CodeableConceptSchema,
  assessment: [ReferenceSchema],
  type: CodeableConceptSchema,
}, { _id: false });

// Evidence Schema (FHIR R4 Condition.evidence)
const EvidenceSchema = new mongoose.Schema({
  code: [CodeableConceptSchema],
  detail: [ReferenceSchema],
}, { _id: false });

// Main Condition Schema (FHIR R4)
const ConditionSchema = new mongoose.Schema({
  resourceType: { type: String, default: "Condition", immutable: true },
  id: { type: String, unique: true, default: () => uuidv4() },

  // Clinical Status (active | recurrence | relapse | inactive | remission | resolved)
  clinicalStatus: {
    type: CodeableConceptSchema,
    default: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
        code: "active",
        display: "Active"
      }]
    }
  },

  // Verification Status (unconfirmed | provisional | differential | confirmed | refuted | entered-in-error)
  verificationStatus: {
    type: CodeableConceptSchema,
    default: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        code: "unconfirmed",
        display: "Unconfirmed"
      }]
    }
  },

  // Category (problem-list-item | encounter-diagnosis | health-concern)
  category: [CodeableConceptSchema],

  // Severity (severe | moderate | mild)
  severity: CodeableConceptSchema,

  // Code - the condition diagnosis (SNOMED CT preferred)
  code: {
    type: CodeableConceptSchema,
    required: true,
  },

  // Body site
  bodySite: [CodeableConceptSchema],

  // Subject (Patient reference - required)
  subject: {
    type: ReferenceSchema,
    required: true,
  },

  // Encounter context
  encounter: ReferenceSchema,

  // Onset[x] - When condition started
  onsetDateTime: Date,
  onsetAge: {
    value: Number,
    unit: String,
    system: String,
    code: String,
  },
  onsetPeriod: PeriodSchema,
  onsetRange: {
    low: { value: Number, unit: String },
    high: { value: Number, unit: String },
  },
  onsetString: String,

  // Abatement[x] - When condition resolved
  abatementDateTime: Date,
  abatementAge: {
    value: Number,
    unit: String,
    system: String,
    code: String,
  },
  abatementPeriod: PeriodSchema,
  abatementRange: {
    low: { value: Number, unit: String },
    high: { value: Number, unit: String },
  },
  abatementString: String,

  // Recorded date
  recordedDate: { type: Date, default: Date.now },

  // Recorder
  recorder: ReferenceSchema,

  // Asserter
  asserter: ReferenceSchema,

  // Stage
  stage: [StageSchema],

  // Evidence
  evidence: [EvidenceSchema],

  // Note
  note: [{
    authorReference: ReferenceSchema,
    authorString: String,
    time: Date,
    text: String,
  }],

}, { timestamps: true });

// Indexes
ConditionSchema.index({ "subject.reference": 1 });
ConditionSchema.index({ "code.coding.code": 1 });
ConditionSchema.index({ "clinicalStatus.coding.code": 1 });
ConditionSchema.index({ "category.coding.code": 1 });

const Condition = mongoose.model("Condition", ConditionSchema, "Condition");

export default Condition;
