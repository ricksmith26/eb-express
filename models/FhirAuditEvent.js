/**
 * FHIR AuditEvent Model
 * Stores security and operational audit events from devices
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/auditevent.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirAuditEventSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'AuditEvent',
    immutable: true
  },

  // FHIR resource ID
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Event type (high-level category)
  type: {
    system: { type: String, default: 'urn:brigid:audit:type' },
    code: { type: String, index: true },  // device, auth, network, call, security, error
    display: String
  },

  // Subtype (specific event)
  subtype: [{
    system: { type: String, default: 'urn:brigid:audit:subtype' },
    code: { type: String, index: true },  // device.boot, auth.success, etc.
    display: String
  }],

  // Action: C (Create), R (Read), U (Update), D (Delete), E (Execute)
  action: {
    type: String,
    enum: ['C', 'R', 'U', 'D', 'E'],
    default: 'E'
  },

  // When the event was recorded
  recorded: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Outcome: 0 (Success), 4 (Minor failure), 8 (Serious failure), 12 (Major failure)
  outcome: {
    type: String,
    enum: ['0', '4', '8', '12'],
    index: true
  },
  outcomeDesc: String,

  // Who/what triggered the event
  agent: [{
    type: {
      coding: [{
        system: String,
        code: String,  // device, user, system
        display: String
      }]
    },
    who: {
      reference: String,  // Device/{id} or User/{id}
      identifier: String  // Device ID or email
    },
    requestor: { type: Boolean, default: true }
  }],

  // Source of the event
  source: {
    observer: {
      reference: String,
      identifier: String,  // Device ID
      deviceId: String     // Quick lookup field
    },
    type: [{
      system: String,
      code: String,  // brigid-pi, web, mobile
      display: String
    }]
  },

  // What was affected
  entity: [{
    what: {
      reference: String
    },
    type: {
      system: String,
      code: String,
      display: String
    },
    detail: [{
      type: String,
      valueString: String
    }]
  }],

  // Brigid-specific metadata
  _brigid: {
    sequence: { type: Number, index: true },  // Ordering within device
    fingerprint: String,  // Hardware fingerprint prefix
    receivedAt: { type: Date, default: Date.now },
    batchId: String  // For batch imports
  }

}, {
  timestamps: true,
  collection: 'fhirauditevents'
});

// Compound indexes for common queries
FhirAuditEventSchema.index({ 'source.observer.deviceId': 1, recorded: -1 });
FhirAuditEventSchema.index({ 'subtype.code': 1, recorded: -1 });
FhirAuditEventSchema.index({ outcome: 1, recorded: -1 });
FhirAuditEventSchema.index({ 'agent.who.identifier': 1, recorded: -1 });

// TTL index - auto-delete events older than 90 days (configurable)
// Comment out if you need longer retention for compliance
// FhirAuditEventSchema.index({ recorded: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static: Find events by device
FhirAuditEventSchema.statics.findByDevice = function(deviceId, options = {}) {
  const { limit = 100, offset = 0, eventType, outcome, startDate, endDate } = options;

  const query = { 'source.observer.deviceId': deviceId };

  if (eventType) {
    query['subtype.code'] = eventType;
  }
  if (outcome) {
    query.outcome = outcome;
  }
  if (startDate || endDate) {
    query.recorded = {};
    if (startDate) query.recorded.$gte = new Date(startDate);
    if (endDate) query.recorded.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ recorded: -1 })
    .skip(offset)
    .limit(limit);
};

// Static: Get event summary for device
FhirAuditEventSchema.statics.getDeviceSummary = function(deviceId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        'source.observer.deviceId': deviceId,
        recorded: { $gte: since }
      }
    },
    {
      $group: {
        _id: {
          type: { $arrayElemAt: ['$subtype.code', 0] },
          outcome: '$outcome'
        },
        count: { $sum: 1 },
        lastOccurrence: { $max: '$recorded' }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        outcomes: {
          $push: {
            outcome: '$_id.outcome',
            count: '$count',
            lastOccurrence: '$lastOccurrence'
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    { $sort: { totalCount: -1 } }
  ]);
};

// Static: Get security alerts
FhirAuditEventSchema.statics.getSecurityAlerts = function(options = {}) {
  const { limit = 50, deviceId, since } = options;

  const query = {
    $or: [
      { 'subtype.code': { $regex: /^security\./ } },
      { outcome: { $in: ['8', '12'] } }  // Serious or major failures
    ]
  };

  if (deviceId) {
    query['source.observer.deviceId'] = deviceId;
  }
  if (since) {
    query.recorded = { $gte: new Date(since) };
  }

  return this.find(query)
    .sort({ recorded: -1 })
    .limit(limit);
};

const FhirAuditEvent = mongoose.model('FhirAuditEvent', FhirAuditEventSchema);

export default FhirAuditEvent;
