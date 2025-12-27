/**
 * Socket.IO Device Registration Event
 * Handles device connections and registration via WebSocket
 */
import FhirDevice from '../../models/FhirDevice.js';

// Track connected devices: Map<deviceId, { socketId, connectedAt, deviceInfo }>
const connectedDevices = new Map();

/**
 * Get socket ID for a device
 */
export const getDeviceSocketId = (deviceId) => {
  const connection = connectedDevices.get(deviceId);
  return connection?.socketId || null;
};

/**
 * Get all connected devices
 */
export const getConnectedDevices = () => {
  return Array.from(connectedDevices.entries()).map(([deviceId, info]) => ({
    deviceId,
    ...info
  }));
};

/**
 * Check if device is connected
 */
export const isDeviceConnected = (deviceId) => {
  return connectedDevices.has(deviceId);
};

/**
 * Register device event handler
 */
const registerDeviceEvent = (io, socket) => {
  socket.on('registerDevice', async (data) => {
    try {
      // Support both object and string formats
      const deviceId = typeof data === 'string' ? data : data?.device_id;
      const fingerprint = data?.fingerprint;
      const authenticated = data?.authenticated || false;

      if (!deviceId) {
        console.error('📱❌ Device registration failed: No device_id provided');
        socket.emit('deviceError', {
          error: 'Device ID required',
          code: 'MISSING_DEVICE_ID'
        });
        return;
      }

      console.log(`📱 Device connecting: ${deviceId} (socket: ${socket.id})`);

      // Check if device is already connected (disconnect old socket)
      const existingConnection = connectedDevices.get(deviceId);
      if (existingConnection && existingConnection.socketId !== socket.id) {
        console.log(`📱 Device ${deviceId} already connected, replacing old connection`);
        // Notify old socket
        io.to(existingConnection.socketId).emit('deviceDisconnected', {
          reason: 'New connection established'
        });
      }

      // Find device in database
      let device = null;
      if (fingerprint) {
        device = await FhirDevice.findByFingerprint(fingerprint);
      } else {
        // Try to find by device_id prefix in fingerprint
        device = await FhirDevice.findOne({
          'identifier.system': 'urn:brigid:device:fingerprint',
          'identifier.value': { $regex: `^${deviceId.toLowerCase()}`, $options: 'i' },
          status: 'active'
        });
      }

      // Update device last seen if found
      if (device) {
        device.lastSeenAt = new Date();
        await device.save();
        console.log(`📱✅ Device ${deviceId} registered and verified`);
      } else {
        console.log(`📱⚠️ Device ${deviceId} connected but not found in database`);
      }

      // Store connection info
      connectedDevices.set(deviceId, {
        socketId: socket.id,
        connectedAt: new Date(),
        authenticated,
        deviceInfo: data?.device_info || {},
        resourceId: device?.id || null
      });

      // Join device-specific room
      socket.join(`device:${deviceId}`);

      // Acknowledge registration
      socket.emit('deviceRegistered', {
        device_id: deviceId,
        verified: !!device,
        resource_id: device?.id || null,
        owner: device?.owner?.email || null
      });

      // Emit to admin/monitoring room
      io.to('device-monitor').emit('deviceConnected', {
        device_id: deviceId,
        verified: !!device,
        connected_at: new Date().toISOString()
      });

    } catch (error) {
      console.error('📱❌ Device registration error:', error);
      socket.emit('deviceError', {
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  });

  // Handle device heartbeat
  socket.on('deviceHeartbeat', async (data) => {
    const deviceId = data?.device_id;
    if (!deviceId) return;

    const connection = connectedDevices.get(deviceId);
    if (connection && connection.socketId === socket.id) {
      // Update last heartbeat
      connection.lastHeartbeat = new Date();

      // Update database last seen
      if (connection.resourceId) {
        await FhirDevice.findOneAndUpdate(
          { id: connection.resourceId },
          { lastSeenAt: new Date() }
        );
      }

      socket.emit('heartbeatAck', { timestamp: new Date().toISOString() });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    // Find and remove device by socket ID
    for (const [deviceId, connection] of connectedDevices.entries()) {
      if (connection.socketId === socket.id) {
        console.log(`📱 Device ${deviceId} disconnected`);
        connectedDevices.delete(deviceId);

        // Emit to monitoring room
        io.to('device-monitor').emit('deviceDisconnected', {
          device_id: deviceId,
          disconnected_at: new Date().toISOString()
        });
        break;
      }
    }
  });

  // Admin: Join device monitor room
  socket.on('joinDeviceMonitor', () => {
    socket.join('device-monitor');
    socket.emit('deviceMonitorJoined', {
      connected_devices: getConnectedDevices()
    });
  });
};

export default registerDeviceEvent;
