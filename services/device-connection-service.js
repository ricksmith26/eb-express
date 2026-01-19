/**
 * Device Connection Service
 * Handles device connection state management and event logging
 */
import FhirDeviceConnection from '../models/FhirDeviceConnection.js';
import FhirConnectionEvent from '../models/FhirConnectionEvent.js';
import Patient from '../models/PatientSchema.js';
import FhirPractitioner from '../models/FhirPractitioner.js';

class DeviceConnectionService {
  /**
   * Get display name for device type
   */
  static getDeviceTypeDisplay(code) {
    const displays = {
      'brigid-pi': 'Brigid Pi Device',
      'android': 'Android App',
      'ios': 'iOS App',
      'web': 'Web Browser',
      'agent': 'Agent Portal',
      'unknown': 'Unknown Device'
    };
    return displays[code] || 'Unknown Device';
  }

  /**
   * Handle patient connection (from register event)
   * Looks up Patient by email and upserts connection record
   * NOTE: Pi devices should use handleDeviceConnect, not this method
   */
  static async handlePatientConnect(email, deviceType, socketId, metadata = {}) {
    try {
      // Pi devices should not use this method - they should use handleDeviceConnect
      if (deviceType === 'brigid-pi') {
        console.warn(`⚠️ Pi device attempted to register via patient connect (email: ${email}). Ignoring.`);
        return null;
      }

      // Look up patient by email in telecom
      const patient = await Patient.findOne({
        'telecom.system': 'email',
        'telecom.value': email.toLowerCase(),
        active: true
      });

      const subjectData = {
        email: email.toLowerCase(),
        type: 'Patient'
      };

      if (patient) {
        subjectData.reference = `Patient/${patient.id}`;
      }

      // Upsert connection record
      const connection = await FhirDeviceConnection.findOneAndUpdate(
        {
          'subject.email': email.toLowerCase(),
          'deviceType.coding.code': deviceType
        },
        {
          $set: {
            status: 'online',
            lastOnlineAt: new Date(),
            'deviceType.coding': [{
              system: 'urn:brigid:connection:device-type',
              code: deviceType,
              display: this.getDeviceTypeDisplay(deviceType)
            }],
            subject: subjectData,
            currentConnection: {
              socketId,
              connectedAt: new Date(),
              ipAddress: metadata.ipAddress || null
            },
            deviceInfo: metadata.deviceInfo || {}
          }
        },
        { upsert: true, new: true }
      );

      // Log connect event
      await FhirConnectionEvent.logConnect({
        deviceType: {
          coding: [{
            system: 'urn:brigid:connection:device-type',
            code: deviceType,
            display: this.getDeviceTypeDisplay(deviceType)
          }]
        },
        subject: subjectData,
        connection: {
          socketId,
          ipAddress: metadata.ipAddress
        }
      });

      console.log(`📱 Patient connection tracked: ${email} (${deviceType})`);
      return connection;
    } catch (error) {
      console.error('Error handling patient connect:', error);
      throw error;
    }
  }

  /**
   * Handle practitioner/agent connection (from registerAgent event)
   * Looks up Practitioner by email and upserts connection record
   */
  static async handlePractitionerConnect(email, socketId, metadata = {}) {
    try {
      // Look up practitioner by email
      const practitioner = await FhirPractitioner.findByEmail(email);

      const subjectData = {
        email: email.toLowerCase(),
        username: email.toLowerCase(), // Store email as username for agents
        type: 'Practitioner'
      };

      if (practitioner) {
        subjectData.reference = `Practitioner/${practitioner.id}`;
      }

      // Upsert connection record (agents always use 'agent' deviceType)
      const connection = await FhirDeviceConnection.findOneAndUpdate(
        {
          'subject.email': email.toLowerCase(),
          'deviceType.coding.code': 'agent'
        },
        {
          $set: {
            status: 'online',
            lastOnlineAt: new Date(),
            'deviceType.coding': [{
              system: 'urn:brigid:connection:device-type',
              code: 'agent',
              display: this.getDeviceTypeDisplay('agent')
            }],
            subject: subjectData,
            currentConnection: {
              socketId,
              connectedAt: new Date(),
              ipAddress: metadata.ipAddress || null
            },
            deviceInfo: metadata.deviceInfo || {}
          }
        },
        { upsert: true, new: true }
      );

      // Log connect event
      await FhirConnectionEvent.logConnect({
        deviceType: {
          coding: [{
            system: 'urn:brigid:connection:device-type',
            code: 'agent',
            display: this.getDeviceTypeDisplay('agent')
          }]
        },
        subject: subjectData,
        connection: {
          socketId,
          ipAddress: metadata.ipAddress
        }
      });

      console.log(`📱 Practitioner connection tracked: ${email} (agent)`);
      return connection;
    } catch (error) {
      console.error('Error handling practitioner connect:', error);
      throw error;
    }
  }

  /**
   * Handle Pi device connection (from registerDevice event)
   */
  static async handleDeviceConnect(deviceId, resourceId, socketId, metadata = {}) {
    try {
      const subjectData = {
        type: 'Device'
      };

      if (metadata.ownerEmail) {
        subjectData.email = metadata.ownerEmail.toLowerCase();
      }

      const deviceData = {
        deviceId
      };

      if (resourceId) {
        deviceData.reference = `Device/${resourceId}`;
      }

      // Upsert connection record
      const connection = await FhirDeviceConnection.findOneAndUpdate(
        {
          'device.deviceId': deviceId
        },
        {
          $set: {
            status: 'online',
            lastOnlineAt: new Date(),
            'deviceType.coding': [{
              system: 'urn:brigid:connection:device-type',
              code: 'brigid-pi',
              display: this.getDeviceTypeDisplay('brigid-pi')
            }],
            subject: subjectData,
            device: deviceData,
            currentConnection: {
              socketId,
              connectedAt: new Date(),
              ipAddress: metadata.deviceInfo?.ipAddress || null
            },
            deviceInfo: {
              model: metadata.deviceInfo?.model || 'Raspberry Pi',
              osVersion: metadata.deviceInfo?.osVersion,
              appVersion: metadata.deviceInfo?.appVersion
            }
          }
        },
        { upsert: true, new: true }
      );

      // Log connect event
      await FhirConnectionEvent.logConnect({
        deviceType: {
          coding: [{
            system: 'urn:brigid:connection:device-type',
            code: 'brigid-pi',
            display: this.getDeviceTypeDisplay('brigid-pi')
          }]
        },
        subject: subjectData,
        device: deviceData,
        connection: {
          socketId,
          ipAddress: metadata.deviceInfo?.ipAddress
        }
      });

      console.log(`📱 Pi device connection tracked: ${deviceId}`);
      return connection;
    } catch (error) {
      console.error('Error handling device connect:', error);
      throw error;
    }
  }

  /**
   * Handle disconnect for any device type
   * Finds connection by socketId and updates status
   */
  static async handleDisconnect(socketId) {
    try {
      const connection = await FhirDeviceConnection.findBySocketId(socketId);

      if (!connection) {
        return null;
      }

      // Calculate session duration
      const sessionDuration = connection.currentConnection?.connectedAt
        ? Date.now() - new Date(connection.currentConnection.connectedAt).getTime()
        : null;

      // Log disconnect event
      await FhirConnectionEvent.logDisconnect({
        deviceType: connection.deviceType,
        subject: connection.subject,
        device: connection.device,
        connection: {
          socketId,
          ipAddress: connection.currentConnection?.ipAddress
        },
        sessionDuration,
        disconnectReason: 'client_disconnect'
      });

      // Update connection status
      connection.status = 'offline';
      connection.lastOfflineAt = new Date();
      connection.currentConnection = {
        socketId: null,
        connectedAt: null,
        ipAddress: null
      };
      await connection.save();

      const identifier = connection.subject?.email || connection.device?.deviceId || 'unknown';
      console.log(`📱 Device disconnected: ${identifier}`);

      return connection;
    } catch (error) {
      console.error('Error handling disconnect:', error);
      throw error;
    }
  }

  /**
   * Get all online devices with optional filters
   */
  static async getOnlineDevices(filters = {}) {
    try {
      return await FhirDeviceConnection.findOnline(filters);
    } catch (error) {
      console.error('Error getting online devices:', error);
      throw error;
    }
  }

  /**
   * Get status summary for dashboard
   */
  static async getStatusSummary() {
    try {
      return await FhirDeviceConnection.getStatusSummary();
    } catch (error) {
      console.error('Error getting status summary:', error);
      throw error;
    }
  }

  /**
   * Get connection history with filters
   */
  static async getConnectionHistory(filters = {}, options = {}) {
    try {
      return await FhirConnectionEvent.getHistory(filters, options);
    } catch (error) {
      console.error('Error getting connection history:', error);
      throw error;
    }
  }

  /**
   * Get connection history for a specific email
   */
  static async getUserConnectionHistory(email, options = {}) {
    return this.getConnectionHistory(
      { 'subject.email': email.toLowerCase() },
      options
    );
  }

  /**
   * Broadcast status change to monitoring room
   */
  static broadcastStatusChange(io, connection, status) {
    if (!io) {
      console.warn('⚠️ broadcastStatusChange: io is null');
      return;
    }
    if (!connection) {
      console.warn('⚠️ broadcastStatusChange: connection is null');
      return;
    }

    const payload = {
      connectionId: connection.id,
      email: connection.subject?.email,
      username: connection.subject?.username,
      deviceType: connection.deviceType?.coding?.[0]?.code,
      deviceId: connection.device?.deviceId,
      status,
      timestamp: new Date().toISOString()
    };

    console.log(`📡 Broadcasting ${status} to status-monitor:`, payload);
    io.to('status-monitor').emit('device_status_change', payload);
  }
}

export default DeviceConnectionService;
