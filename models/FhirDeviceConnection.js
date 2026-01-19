/**
 * FHIR Device Connection Model
 * Tracks current online/offline status for all device types (Pi, mobile, agents)
 *
 * Custom resource following FHIR patterns
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirDeviceConnectionSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'DeviceConnection',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Connection status
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline',
    index: true
  },

  // Device type classification
  deviceType: {
    coding: [{
      system: { type: String, default: 'urn:brigid:connection:device-type' },
      code: {
        type: String,
        enum: ['brigid-pi', 'android', 'ios', 'web', 'agent', 'unknown'],
        index: true
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
    email: {
      type: String,
      index: true
    },
    username: String  // For agents (may be same as email)
  },

  // Device reference - only for Pi devices
  device: {
    reference: String,  // 'Device/{id}'
    deviceId: String,
    fingerprint: String,
    macAddress: String,
    hostname: String
  },

  // Current socket connection info
  currentConnection: {
    socketId: {
      type: String,
      index: true
    },
    connectedAt: Date,
    ipAddress: String
  },

  // Timestamps for tracking
  lastOnlineAt: {
    type: Date,
    index: true
  },
  lastOfflineAt: Date,

  // Device metadata
  deviceInfo: {
    model: String,
    osVersion: String,
    appVersion: String
  }

}, {
  timestamps: true,
  collection: 'fhirdeviceconnections'
});

// Compound indexes for common queries
FhirDeviceConnectionSchema.index({ 'subject.email': 1, 'deviceType.coding.code': 1 }, { unique: true, sparse: true });
FhirDeviceConnectionSchema.index({ 'subject.username': 1 }, { sparse: true });
FhirDeviceConnectionSchema.index({ status: 1, lastOnlineAt: -1 });
FhirDeviceConnectionSchema.index({ 'device.deviceId': 1 }, { sparse: true });

// Static method: Find by socket ID
FhirDeviceConnectionSchema.statics.findBySocketId = function(socketId) {
  return this.findOne({ 'currentConnection.socketId': socketId });
};

// Static method: Find online devices
FhirDeviceConnectionSchema.statics.findOnline = function(filters = {}) {
  const query = { status: 'online', ...filters };
  return this.find(query).sort({ lastOnlineAt: -1 });
};

// Static method: Get status summary
FhirDeviceConnectionSchema.statics.getStatusSummary = async function() {
  const result = await this.aggregate([
    {
      $group: {
        _id: {
          status: '$status',
          deviceType: { $arrayElemAt: ['$deviceType.coding.code', 0] }
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    total: 0,
    online: { total: 0, byType: {} },
    offline: { total: 0, byType: {} }
  };

  result.forEach(item => {
    const { status, deviceType } = item._id;
    summary.total += item.count;

    if (status === 'online') {
      summary.online.total += item.count;
      summary.online.byType[deviceType] = (summary.online.byType[deviceType] || 0) + item.count;
    } else {
      summary.offline.total += item.count;
      summary.offline.byType[deviceType] = (summary.offline.byType[deviceType] || 0) + item.count;
    }
  });

  return summary;
};

// Instance method: Mark as online
FhirDeviceConnectionSchema.methods.markOnline = function(socketId, ipAddress) {
  this.status = 'online';
  this.lastOnlineAt = new Date();
  this.currentConnection = {
    socketId,
    connectedAt: new Date(),
    ipAddress
  };
  return this.save();
};

// Instance method: Mark as offline
FhirDeviceConnectionSchema.methods.markOffline = function() {
  this.status = 'offline';
  this.lastOfflineAt = new Date();
  this.currentConnection = {
    socketId: null,
    connectedAt: null,
    ipAddress: null
  };
  return this.save();
};

const FhirDeviceConnection = mongoose.model('FhirDeviceConnection', FhirDeviceConnectionSchema);

export default FhirDeviceConnection;
