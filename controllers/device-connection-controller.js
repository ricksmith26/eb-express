/**
 * Device Connection Controller
 * Handles API endpoints for device connection status and history
 */
import DeviceConnectionService from '../services/device-connection-service.js';
import FhirDeviceConnection from '../models/FhirDeviceConnection.js';
import FhirConnectionEvent from '../models/FhirConnectionEvent.js';

/**
 * Transform a connection document to include displayIdentifier
 */
const transformConnection = (conn) => {
  const doc = conn.toObject ? conn.toObject() : conn;
  const deviceTypeCode = doc.deviceType?.coding?.[0]?.code;

  // Compute displayIdentifier based on device type
  let displayIdentifier = null;
  if (deviceTypeCode === 'brigid-pi') {
    displayIdentifier = doc.device?.deviceId || null;
  } else {
    displayIdentifier = doc.subject?.email || doc.subject?.username || null;
  }

  return {
    ...doc,
    displayIdentifier,
    // Ensure lastUpdated is set for frontend compatibility
    lastUpdated: doc.lastOnlineAt || doc.lastOfflineAt || doc.updatedAt || doc.createdAt
  };
};

class DeviceConnectionController {

  /**
   * GET /device-connections
   * List all device connections
   */
  async list(req, res) {
    try {
      const { status, deviceType, limit = 50, offset = 0 } = req.query;

      const query = {};
      if (status) {
        query.status = status;
      }
      if (deviceType) {
        query['deviceType.coding.code'] = deviceType;
      }

      const connections = await FhirDeviceConnection.find(query)
        .sort({ lastOnlineAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await FhirDeviceConnection.countDocuments(query);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: connections.map(c => ({ resource: transformConnection(c) }))
      });
    } catch (error) {
      console.error('Error listing device connections:', error);
      res.status(500).json({ error: 'Failed to list device connections' });
    }
  }

  /**
   * GET /device-connections/online
   * List all online devices
   */
  async listOnline(req, res) {
    try {
      const { deviceType, limit = 100 } = req.query;

      const filters = {};
      if (deviceType) {
        filters['deviceType.coding.code'] = deviceType;
      }

      const devices = await DeviceConnectionService.getOnlineDevices(filters);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total: devices.length,
        entry: devices.slice(0, parseInt(limit)).map(d => ({ resource: transformConnection(d) }))
      });
    } catch (error) {
      console.error('Error listing online devices:', error);
      res.status(500).json({ error: 'Failed to list online devices' });
    }
  }

  /**
   * GET /device-connections/status
   * Get dashboard summary of device statuses
   */
  async getStatusSummary(req, res) {
    try {
      const summary = await DeviceConnectionService.getStatusSummary();

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        summary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting status summary:', error);
      res.status(500).json({ error: 'Failed to get status summary' });
    }
  }

  /**
   * GET /device-connections/user/:email
   * Get connections for a specific user (patient)
   */
  async getUserConnections(req, res) {
    try {
      const { email } = req.params;

      const connections = await FhirDeviceConnection.find({
        'subject.email': email.toLowerCase()
      }).sort({ lastOnlineAt: -1 });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total: connections.length,
        entry: connections.map(c => ({ resource: transformConnection(c) }))
      });
    } catch (error) {
      console.error('Error getting user connections:', error);
      res.status(500).json({ error: 'Failed to get user connections' });
    }
  }

  /**
   * GET /device-connections/agent/:username
   * Get connection for a specific agent (practitioner)
   */
  async getAgentConnection(req, res) {
    try {
      const { username } = req.params;

      const connection = await FhirDeviceConnection.findOne({
        'subject.username': username.toLowerCase(),
        'deviceType.coding.code': 'agent'
      });

      if (!connection) {
        return res.status(404).json({ error: 'Agent connection not found' });
      }

      res.json(transformConnection(connection));
    } catch (error) {
      console.error('Error getting agent connection:', error);
      res.status(500).json({ error: 'Failed to get agent connection' });
    }
  }

  /**
   * GET /device-connections/history
   * Get connection event history
   */
  async getHistory(req, res) {
    try {
      const { eventType, deviceType, email, limit = 100, offset = 0 } = req.query;

      const filters = {};
      if (eventType) {
        filters.eventType = eventType;
      }
      if (deviceType) {
        filters['deviceType.coding.code'] = deviceType;
      }
      if (email) {
        filters['subject.email'] = email.toLowerCase();
      }

      const events = await DeviceConnectionService.getConnectionHistory(filters, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const total = await FhirConnectionEvent.countDocuments(filters);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: events.map(e => ({ resource: e }))
      });
    } catch (error) {
      console.error('Error getting connection history:', error);
      res.status(500).json({ error: 'Failed to get connection history' });
    }
  }

  /**
   * GET /device-connections/history/:email
   * Get connection history for a specific user
   */
  async getUserHistory(req, res) {
    try {
      const { email } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const events = await DeviceConnectionService.getUserConnectionHistory(email, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const total = await FhirConnectionEvent.countDocuments({
        'subject.email': email.toLowerCase()
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: events.map(e => ({ resource: e }))
      });
    } catch (error) {
      console.error('Error getting user connection history:', error);
      res.status(500).json({ error: 'Failed to get user connection history' });
    }
  }

  /**
   * GET /device-connections/:id
   * Get a specific connection by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const connection = await FhirDeviceConnection.findOne({ id });

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      res.json(transformConnection(connection));
    } catch (error) {
      console.error('Error getting connection:', error);
      res.status(500).json({ error: 'Failed to get connection' });
    }
  }
}

export default new DeviceConnectionController();
