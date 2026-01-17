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

// Quantity Schema
const QuantitySchema = new mongoose.Schema({
  value: Number,
  unit: String,
  system: String,
  code: String,
}, { _id: false });

// Ratio Schema
const RatioSchema = new mongoose.Schema({
  numerator: QuantitySchema,
  denominator: QuantitySchema,
}, { _id: false });

// Timing Schema
const TimingSchema = new mongoose.Schema({
  event: [Date],
  repeat: {
    boundsDuration: QuantitySchema,
    boundsPeriod: PeriodSchema,
    boundsRange: {
      low: QuantitySchema,
      high: QuantitySchema,
    },
    count: Number,
    countMax: Number,
    duration: Number,
    durationMax: Number,
    durationUnit: { type: String, enum: ["s", "min", "h", "d", "wk", "mo", "a"] },
    frequency: Number,
    frequencyMax: Number,
    period: Number,
    periodMax: Number,
    periodUnit: { type: String, enum: ["s", "min", "h", "d", "wk", "mo", "a"] },
    dayOfWeek: [{ type: String, enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }],
    timeOfDay: [String],
    when: [String],
    offset: Number,
  },
  code: CodeableConceptSchema,
}, { _id: false });

// Dosage Schema (FHIR R4)
const DosageSchema = new mongoose.Schema({
  sequence: Number,
  text: String,
  additionalInstruction: [CodeableConceptSchema],
  patientInstruction: String,
  timing: TimingSchema,
  asNeededBoolean: Boolean,
  asNeededCodeableConcept: CodeableConceptSchema,
  site: CodeableConceptSchema,
  route: CodeableConceptSchema,
  method: CodeableConceptSchema,
  doseAndRate: [{
    type: CodeableConceptSchema,
    doseRange: {
      low: QuantitySchema,
      high: QuantitySchema,
    },
    doseQuantity: QuantitySchema,
    rateRatio: RatioSchema,
    rateRange: {
      low: QuantitySchema,
      high: QuantitySchema,
    },
    rateQuantity: QuantitySchema,
  }],
  maxDosePerPeriod: RatioSchema,
  maxDosePerAdministration: QuantitySchema,
  maxDosePerLifetime: QuantitySchema,
}, { _id: false });

// Main MedicationStatement Schema (FHIR R4)
const MedicationStatementSchema = new mongoose.Schema({
  resourceType: { type: String, default: "MedicationStatement", immutable: true },
  id: { type: String, unique: true, default: () => uuidv4() },

  // Identifier
  identifier: [{
    system: String,
    value: String,
  }],

  // Based on (other request/statement)
  basedOn: [ReferenceSchema],

  // Part of (procedure, observation)
  partOf: [ReferenceSchema],

  // Status (active | completed | entered-in-error | intended | stopped | on-hold | unknown | not-taken)
  status: {
    type: String,
    enum: ["active", "completed", "entered-in-error", "intended", "stopped", "on-hold", "unknown", "not-taken"],
    required: true,
    default: "active",
  },

  // Status Reason
  statusReason: [CodeableConceptSchema],

  // Category
  category: CodeableConceptSchema,

  // Medication (using CodeableConcept - RxNorm or dm+d for UK)
  medicationCodeableConcept: {
    type: CodeableConceptSchema,
    required: true,
  },

  // Subject (Patient reference - required)
  subject: {
    type: ReferenceSchema,
    required: true,
  },

  // Context (Encounter or EpisodeOfCare)
  context: ReferenceSchema,

  // Effective[x] - When medication was taken
  effectiveDateTime: Date,
  effectivePeriod: PeriodSchema,

  // Date asserted
  dateAsserted: { type: Date, default: Date.now },

  // Information source
  informationSource: ReferenceSchema,

  // Derived from
  derivedFrom: [ReferenceSchema],

  // Reason code
  reasonCode: [CodeableConceptSchema],

  // Reason reference (Condition, Observation, DiagnosticReport)
  reasonReference: [ReferenceSchema],

  // Note
  note: [{
    authorReference: ReferenceSchema,
    authorString: String,
    time: Date,
    text: String,
  }],

  // Dosage instructions
  dosage: [DosageSchema],

}, { timestamps: true });

// Indexes
MedicationStatementSchema.index({ "subject.reference": 1 });
MedicationStatementSchema.index({ "medicationCodeableConcept.coding.code": 1 });
MedicationStatementSchema.index({ status: 1 });
MedicationStatementSchema.index({ "category.coding.code": 1 });

const MedicationStatement = mongoose.model("MedicationStatement", MedicationStatementSchema, "MedicationStatement");

export default MedicationStatement;
