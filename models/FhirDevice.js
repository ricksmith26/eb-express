/**
 * FHIR Device Model
 * Represents IoT devices (Raspberry Pi units) in the Brigid system
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/device.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirDeviceSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'Device',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Device identifiers (hardware fingerprint, MAC, etc.)
  identifier: [{
    system: {
      type: String,
      enum: [
        'urn:brigid:device:fingerprint',  // SHA256 hardware fingerprint
        'urn:brigid:device:mac',          // MAC address
        'urn:brigid:device:serial'        // CPU serial
      ]
    },
    value: String
  }],

  // Device status: active | inactive | entered-in-error
  status: {
    type: String,
    enum: ['active', 'inactive', 'entered-in-error'],
    default: 'active',
    index: true
  },

  // Hardware info
  manufacturer: {
    type: String,
    default: 'Raspberry Pi Foundation'
  },
  modelNumber: String,  // e.g., 'Pi 4 Model B'
  serialNumber: String, // CPU serial from /proc/cpuinfo

  // Device names
  deviceName: [{
    name: String,
    type: {
      type: String,
      enum: ['user-friendly-name', 'patient-reported-name', 'manufacturer-name', 'model-name']
    }
  }],

  // Device type coding
  type: {
    coding: [{
      system: { type: String, default: 'urn:brigid:device:type' },
      code: { type: String, default: 'brigid-pi' },
      display: { type: String, default: 'Brigid Pi Device' }
    }]
  },

  // Certificate storage (encrypted, not returned by default)
  certificate: {
    type: String,
    select: false  // PEM certificate - excluded from queries by default
  },
  certificateExpiry: Date,
  certificateFingerprint: {  // SHA256 of cert for quick lookup
    type: String,
    index: true
  },

  // Owner reference
  owner: {
    reference: String,       // 'Organization/brigid-healthcare' or 'User/{id}'
    email: {                 // Associated user email
      type: String,
      index: true
    }
  },

  // JWT refresh token for device (like user's jwtRefreshToken)
  jwtRefreshToken: {
    type: String,
    select: false  // Excluded from queries by default
  },
  jwtRefreshTokenExpiry: Date,

  // Revocation
  revokedAt: Date,
  revokedReason: String,

  // Connection tracking
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastSeenAt: {
    type: Date,
    index: true
  },

  // Device info from registration
  deviceInfo: {
    hostname: String,
    osVersion: String,
    appVersion: String,
    ipAddress: String
  }

}, {
  timestamps: true,
  collection: 'fhirdevices'
});

// Compound indexes for common queries
FhirDeviceSchema.index({ 'identifier.system': 1, 'identifier.value': 1 });
FhirDeviceSchema.index({ 'owner.email': 1, status: 1 });
FhirDeviceSchema.index({ status: 1, lastSeenAt: -1 });

// Instance method: Get device ID (first 16 chars of fingerprint)
FhirDeviceSchema.methods.getDeviceId = function() {
  const fingerprint = this.identifier.find(i => i.system === 'urn:brigid:device:fingerprint');
  return fingerprint ? fingerprint.value.substring(0, 16).toUpperCase() : this.id;
};

// Instance method: Check if certificate needs renewal (within 24 hours)
FhirDeviceSchema.methods.needsCertRenewal = function() {
  if (!this.certificateExpiry) return true;
  const dayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return this.certificateExpiry <= dayFromNow;
};

// Static method: Find by hardware fingerprint
FhirDeviceSchema.statics.findByFingerprint = function(fingerprint) {
  return this.findOne({
    'identifier.system': 'urn:brigid:device:fingerprint',
    'identifier.value': fingerprint,
    status: 'active'
  });
};

// Static method: Find by certificate fingerprint
FhirDeviceSchema.statics.findByCertFingerprint = function(certFingerprint) {
  return this.findOne({
    certificateFingerprint: certFingerprint,
    status: 'active'
  });
};

// Pre-save: Update lastSeenAt
FhirDeviceSchema.pre('save', function(next) {
  this.lastSeenAt = new Date();
  next();
});

const FhirDevice = mongoose.model('FhirDevice', FhirDeviceSchema);

export default FhirDevice;
