/**
 * FHIR DeviceMetric Model
 * Tracks device connectivity/status over time for telecare devices
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/devicemetric.html
 * Used for tracking SIP registration status history of telecare devices
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirDeviceMetricSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'DeviceMetric',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Device identifier (e.g., "TC-1000")
  deviceId: {
    type: String,
    required: true,
    index: true
  },

  // Metric type
  type: {
    coding: [{
      system: { type: String, default: 'urn:brigid:device-metric:type' },
      code: {
        type: String,
        enum: ['sip-registration-status', 'connectivity', 'heartbeat', 'power-status'],
        default: 'sip-registration-status'
      },
      display: String
    }]
  },

  // Category: measurement | setting | calculation | unspecified
  category: {
    type: String,
    enum: ['measurement', 'setting', 'calculation', 'unspecified'],
    default: 'measurement'
  },

  // Connectivity status value
  status: {
    type: String,
    enum: ['online', 'offline', 'unknown'],
    index: true
  },

  // Previous connectivity status (for tracking transitions)
  previousStatus: {
    type: String,
    enum: ['online', 'offline', 'unknown']
  },

  // Power status value (for UPS monitoring)
  powerStatus: {
    type: String,
    enum: ['mains', 'battery', 'unknown'],
    index: true
  },

  // Previous power status (for tracking transitions)
  previousPowerStatus: {
    type: String,
    enum: ['mains', 'battery', 'unknown']
  },

  // Battery percentage (if available from UPS)
  batteryPercent: {
    type: Number,
    min: 0,
    max: 100
  },

  // Contact status from Asterisk (Reachable, Unreachable, NonQualified, etc.)
  contactStatus: String,

  // Device state from Asterisk
  deviceState: String,

  // SIP URI at time of event
  uri: String,

  // Timestamp of the metric
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Source of the status change
  source: {
    type: String,
    enum: ['ami-contact-status', 'ami-device-state', 'health-check', 'manual', 'ups-service'],
    default: 'ami-contact-status'
  },

  // Reference to the parent Device resource (if exists)
  parent: {
    reference: String,  // 'Device/{id}'
    type: { type: String, default: 'Device' }
  },

  // Additional context
  context: {
    organizationId: String,
    userName: String,
    userPhone: String
  }

}, {
  timestamps: true,
  collection: 'fhirdevicemetrics'
});

// Indexes for common queries
FhirDeviceMetricSchema.index({ deviceId: 1, timestamp: -1 });
FhirDeviceMetricSchema.index({ status: 1, timestamp: -1 });
FhirDeviceMetricSchema.index({ powerStatus: 1, timestamp: -1 });
FhirDeviceMetricSchema.index({ 'type.coding.code': 1, timestamp: -1 });
FhirDeviceMetricSchema.index({ deviceId: 1, 'type.coding.code': 1, timestamp: -1 });

// TTL index for auto-cleanup (90 days)
FhirDeviceMetricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

/**
 * Log a status change event
 */
FhirDeviceMetricSchema.statics.logStatusChange = async function(data) {
  // Get previous status for this device
  const lastMetric = await this.findOne(
    { deviceId: data.deviceId, 'type.coding.code': 'sip-registration-status' },
    { status: 1 }
  ).sort({ timestamp: -1 });

  return this.create({
    deviceId: data.deviceId,
    type: {
      coding: [{
        system: 'urn:brigid:device-metric:type',
        code: 'sip-registration-status',
        display: 'SIP Registration Status'
      }]
    },
    status: data.status,
    previousStatus: lastMetric?.status,
    contactStatus: data.contactStatus,
    deviceState: data.deviceState,
    uri: data.uri,
    timestamp: data.timestamp || new Date(),
    source: data.source || 'ami-contact-status',
    context: data.context
  });
};

/**
 * Log a power status change event
 */
FhirDeviceMetricSchema.statics.logPowerStatusChange = async function(data) {
  // Get previous power status for this device
  const lastMetric = await this.findOne(
    { deviceId: data.deviceId, 'type.coding.code': 'power-status' },
    { powerStatus: 1 }
  ).sort({ timestamp: -1 });

  return this.create({
    deviceId: data.deviceId,
    type: {
      coding: [{
        system: 'urn:brigid:device-metric:type',
        code: 'power-status',
        display: 'UPS Power Status'
      }]
    },
    powerStatus: data.powerStatus,
    previousPowerStatus: lastMetric?.powerStatus,
    batteryPercent: data.batteryPercent,
    timestamp: data.timestamp || new Date(),
    source: 'ups-service',
    context: data.context
  });
};

/**
 * Get current power status for a device
 */
FhirDeviceMetricSchema.statics.getCurrentPowerStatus = async function(deviceId) {
  return this.findOne(
    { deviceId, 'type.coding.code': 'power-status' }
  ).sort({ timestamp: -1 });
};

/**
 * Get power status history for a device
 */
FhirDeviceMetricSchema.statics.getPowerHistory = function(deviceId, options = {}) {
  const { limit = 100, since } = options;
  const query = { deviceId, 'type.coding.code': 'power-status' };

  if (since) {
    query.timestamp = { $gte: new Date(since) };
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit);
};

/**
 * Get status history for a device
 */
FhirDeviceMetricSchema.statics.getHistory = function(deviceId, options = {}) {
  const { limit = 100, offset = 0, since } = options;
  const query = { deviceId };

  if (since) {
    query.timestamp = { $gte: new Date(since) };
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit);
};

/**
 * Get current status for all devices
 * Only considers sip-registration-status metrics (not power-status events)
 */
FhirDeviceMetricSchema.statics.getCurrentStatuses = async function() {
  return this.aggregate([
    { $match: { 'type.coding.code': 'sip-registration-status' } },
    { $sort: { deviceId: 1, timestamp: -1 } },
    {
      $group: {
        _id: '$deviceId',
        status: { $first: '$status' },
        timestamp: { $first: '$timestamp' },
        contactStatus: { $first: '$contactStatus' }
      }
    }
  ]);
};

/**
 * Get recent status changes
 */
FhirDeviceMetricSchema.statics.getRecentChanges = function(minutes = 60) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.find({ timestamp: { $gte: since } })
    .sort({ timestamp: -1 });
};

/**
 * Get uptime statistics for a device
 */
FhirDeviceMetricSchema.statics.getUptimeStats = async function(deviceId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const events = await this.find({
    deviceId,
    timestamp: { $gte: since }
  }).sort({ timestamp: 1 });

  if (events.length === 0) {
    return { uptimePercent: null, totalEvents: 0 };
  }

  let onlineTime = 0;
  let lastOnlineAt = null;

  for (const event of events) {
    if (event.status === 'online') {
      lastOnlineAt = event.timestamp;
    } else if (event.status === 'offline' && lastOnlineAt) {
      onlineTime += event.timestamp - lastOnlineAt;
      lastOnlineAt = null;
    }
  }

  // If currently online, add time to now
  if (lastOnlineAt) {
    onlineTime += Date.now() - lastOnlineAt;
  }

  const totalTime = hours * 60 * 60 * 1000;
  const uptimePercent = Math.round((onlineTime / totalTime) * 100);

  return {
    uptimePercent,
    onlineTime,
    totalEvents: events.length,
    since
  };
};

const FhirDeviceMetric = mongoose.model('FhirDeviceMetric', FhirDeviceMetricSchema);

export default FhirDeviceMetric;
