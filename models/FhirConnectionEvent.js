/**
 * FHIR Connection Event Model
 * Logs every connect/disconnect event for full audit history
 *
 * Custom resource following FHIR patterns
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirConnectionEventSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'ConnectionEvent',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Event type
  eventType: {
    type: String,
    enum: ['connect', 'disconnect'],
    required: true,
    index: true
  },

  // When the event occurred
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Device type classification
  deviceType: {
    coding: [{
      system: { type: String, default: 'urn:brigid:connection:device-type' },
      code: {
        type: String,
        enum: ['brigid-pi', 'android', 'ios', 'web', 'agent', 'unknown']
      },
      display: String
    }]
  },

  // Subject - links to Patient or Practitioner
  subject: {
    reference: String,  // 'Patient/{patientId}' or 'Practitioner/{practitionerId}'
    type: {
      type: String,
      enum: ['Patient', 'Practitioner', 'Device']
    },
    email: String,
    username: String
  },

  // Device reference - only for Pi devices
  device: {
    reference: String,  // 'Device/{id}'
    deviceId: String
  },

  // Connection details at time of event
  connection: {
    socketId: String,
    ipAddress: String,
    userAgent: String
  },

  // Session duration in milliseconds (only on disconnect events)
  sessionDuration: Number,

  // Reason for disconnect
  disconnectReason: {
    type: String,
    enum: ['client_disconnect', 'timeout', 'replaced', 'server_shutdown', 'error', 'unknown']
  }

}, {
  timestamps: true,
  collection: 'fhirconnectionevents'
});

// Indexes for common queries
FhirConnectionEventSchema.index({ timestamp: -1 });
FhirConnectionEventSchema.index({ 'subject.email': 1, timestamp: -1 });
FhirConnectionEventSchema.index({ 'subject.username': 1, timestamp: -1 });
FhirConnectionEventSchema.index({ 'device.deviceId': 1, timestamp: -1 });
FhirConnectionEventSchema.index({ eventType: 1, timestamp: -1 });

// Optional: TTL index for auto-cleanup (90 days)
// Uncomment to enable automatic cleanup of old events
// FhirConnectionEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Static method: Log a connect event
FhirConnectionEventSchema.statics.logConnect = function(data) {
  return this.create({
    eventType: 'connect',
    timestamp: new Date(),
    deviceType: data.deviceType,
    subject: data.subject,
    device: data.device,
    connection: data.connection
  });
};

// Static method: Log a disconnect event
FhirConnectionEventSchema.statics.logDisconnect = function(data) {
  return this.create({
    eventType: 'disconnect',
    timestamp: new Date(),
    deviceType: data.deviceType,
    subject: data.subject,
    device: data.device,
    connection: data.connection,
    sessionDuration: data.sessionDuration,
    disconnectReason: data.disconnectReason || 'client_disconnect'
  });
};

// Static method: Get connection history for a subject
FhirConnectionEventSchema.statics.getHistory = function(filters = {}, options = {}) {
  const { limit = 100, offset = 0 } = options;
  return this.find(filters)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit);
};

// Static method: Get recent events
FhirConnectionEventSchema.statics.getRecent = function(minutes = 60, limit = 100) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.find({ timestamp: { $gte: since } })
    .sort({ timestamp: -1 })
    .limit(limit);
};

const FhirConnectionEvent = mongoose.model('FhirConnectionEvent', FhirConnectionEventSchema);

export default FhirConnectionEvent;
