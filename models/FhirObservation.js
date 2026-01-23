/**
 * FHIR Observation Model
 * Stores clinical observations including wellness checks from devices
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/observation.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirObservationSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'Observation',
    immutable: true
  },

  // FHIR resource ID
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Status: registered | preliminary | final | amended | corrected | cancelled | entered-in-error | unknown
  status: {
    type: String,
    enum: ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'],
    default: 'final',
    index: true
  },

  // Category (e.g., social-history for wellness checks)
  category: [{
    coding: [{
      system: { type: String },
      code: { type: String, index: true },
      display: String
    }]
  }],

  // Code identifying what was observed
  code: {
    coding: [{
      system: { type: String },
      code: { type: String, index: true },  // wellness-check, vital-signs, etc.
      display: String
    }],
    text: String
  },

  // Subject of the observation (Patient reference)
  subject: {
    reference: { type: String, index: true },  // Patient/{id}
    display: String
  },

  // When the observation was made
  effectiveDateTime: {
    type: Date,
    index: true
  },

  // When the observation was recorded
  issued: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Who/what performed the observation
  performer: [{
    reference: String,
    identifier: {
      system: String,
      value: String  // Device ID
    },
    display: String
  }],

  // Primary result value (as CodeableConcept for wellness status)
  valueCodeableConcept: {
    coding: [{
      system: String,
      code: String,  // good, okay, not-well
      display: String
    }],
    text: String
  },

  // Alternative value types
  valueString: String,
  valueBoolean: Boolean,
  valueQuantity: {
    value: Number,
    unit: String,
    system: String,
    code: String
  },

  // Component observations (e.g., needs-help, session-duration)
  component: [{
    code: {
      coding: [{
        system: String,
        code: String,
        display: String
      }]
    },
    valueBoolean: Boolean,
    valueString: String,
    valueQuantity: {
      value: Number,
      unit: String,
      system: String,
      code: String
    }
  }],

  // Additional notes (e.g., transcript)
  note: [{
    text: String,
    time: Date
  }],

  // Brigid-specific metadata
  _brigid: {
    deviceId: { type: String, index: true },  // Quick lookup field
    patientId: { type: String, index: true }, // Extracted patient ID
    receivedAt: { type: Date, default: Date.now }
  }

}, {
  timestamps: true,
  collection: 'fhirobservations'
});

// Compound indexes for common queries
FhirObservationSchema.index({ '_brigid.patientId': 1, effectiveDateTime: -1 });
FhirObservationSchema.index({ '_brigid.deviceId': 1, effectiveDateTime: -1 });
FhirObservationSchema.index({ 'code.coding.code': 1, effectiveDateTime: -1 });
FhirObservationSchema.index({ 'subject.reference': 1, effectiveDateTime: -1 });

// Static: Find observations by patient
FhirObservationSchema.statics.findByPatient = function(patientId, options = {}) {
  const { limit = 100, offset = 0, code, startDate, endDate } = options;

  const query = {
    $or: [
      { '_brigid.patientId': patientId },
      { 'subject.reference': `Patient/${patientId}` }
    ]
  };

  if (code) {
    query['code.coding.code'] = code;
  }
  if (startDate || endDate) {
    query.effectiveDateTime = {};
    if (startDate) query.effectiveDateTime.$gte = new Date(startDate);
    if (endDate) query.effectiveDateTime.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ effectiveDateTime: -1 })
    .skip(offset)
    .limit(limit);
};

// Static: Find wellness checks by patient
FhirObservationSchema.statics.findWellnessChecks = function(patientId, options = {}) {
  return this.findByPatient(patientId, {
    ...options,
    code: 'wellness-check'
  });
};

// Static: Get wellness check summary for patient
FhirObservationSchema.statics.getWellnessSummary = function(patientId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        $or: [
          { '_brigid.patientId': patientId },
          { 'subject.reference': `Patient/${patientId}` }
        ],
        'code.coding.code': 'wellness-check',
        effectiveDateTime: { $gte: since }
      }
    },
    {
      $group: {
        _id: {
          status: { $arrayElemAt: ['$valueCodeableConcept.coding.code', 0] }
        },
        count: { $sum: 1 },
        lastOccurrence: { $max: '$effectiveDateTime' }
      }
    },
    {
      $project: {
        _id: 0,
        status: '$_id.status',
        count: 1,
        lastOccurrence: 1
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static: Find observations by device
FhirObservationSchema.statics.findByDevice = function(deviceId, options = {}) {
  const { limit = 100, offset = 0, code, startDate, endDate } = options;

  const query = { '_brigid.deviceId': deviceId };

  if (code) {
    query['code.coding.code'] = code;
  }
  if (startDate || endDate) {
    query.effectiveDateTime = {};
    if (startDate) query.effectiveDateTime.$gte = new Date(startDate);
    if (endDate) query.effectiveDateTime.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ effectiveDateTime: -1 })
    .skip(offset)
    .limit(limit);
};

const FhirObservation = mongoose.model('FhirObservation', FhirObservationSchema);

export default FhirObservation;
