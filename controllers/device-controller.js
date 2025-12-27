/**
 * Device Controller
 * Handles device registration, authentication, and management
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import FhirDevice from '../models/FhirDevice.js';
import caService from '../services/ca-service.js';

const { JWT_SECRET, DEVICE_JWT_SECRET } = process.env;

// Token configuration
const ACCESS_TOKEN_EXPIRY = '5m';      // Short-lived access tokens
const REFRESH_TOKEN_EXPIRY = '30d';    // Long-lived refresh tokens
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days in ms

// Use separate secret for devices if available
const getDeviceSecret = () => DEVICE_JWT_SECRET || JWT_SECRET;

/**
 * Generate device tokens (access + refresh)
 */
const generateDeviceTokens = (device) => {
  const deviceId = device.id;
  const fingerprint = device.identifier.find(i => i.system === 'urn:brigid:device:fingerprint')?.value;

  // Access token (short-lived)
  const accessToken = jwt.sign(
    {
      type: 'device',
      deviceId,
      fingerprint: fingerprint?.substring(0, 16),
      canPublish: true,
      canSubscribe: true,
      roles: ['device']
    },
    getDeviceSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Refresh token (long-lived)
  const refreshToken = jwt.sign(
    {
      type: 'device_refresh',
      deviceId
    },
    getDeviceSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  // Calculate expiry times
  const accessExpiry = new Date(Date.now() + 5 * 60 * 1000);  // 5 minutes
  const refreshExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  return { accessToken, refreshToken, accessExpiry, refreshExpiry };
};

class DeviceController {

  /**
   * POST /device/register
   * Register a new device with CSR
   */
  async register(req, res) {
    try {
      const { device_id, fingerprint, csr, device_type, device_info } = req.body;

      // Validate required fields
      if (!device_id || !fingerprint) {
        return res.status(400).json({
          error: 'Device ID and fingerprint required',
          code: 'MISSING_CREDENTIALS'
        });
      }

      // Verify device_id matches fingerprint
      const expectedDeviceId = fingerprint.substring(0, 16).toUpperCase();
      if (device_id !== expectedDeviceId) {
        return res.status(400).json({
          error: 'Device ID does not match fingerprint',
          code: 'DEVICE_ID_MISMATCH'
        });
      }

      // Check if device already exists
      let device = await FhirDevice.findByFingerprint(fingerprint);

      if (device) {
        console.log(`📱 Device ${device_id} re-registering`);
        // Update existing device info
        device.deviceInfo = {
          ...device.deviceInfo,
          ...device_info,
        };
        device.lastSeenAt = new Date();
        await device.save();
      } else {
        console.log(`📱 New device registration: ${device_id}`);
        // Create new device
        device = new FhirDevice({
          identifier: [
            { system: 'urn:brigid:device:fingerprint', value: fingerprint }
          ],
          type: {
            coding: [{
              system: 'urn:brigid:device:type',
              code: device_type || 'brigid-pi',
              display: 'Brigid Pi Device'
            }]
          },
          deviceName: [{
            name: device_info?.hostname || `brigid-${device_id.substring(0, 8).toLowerCase()}`,
            type: 'user-friendly-name'
          }],
          deviceInfo: device_info || {},
          registeredAt: new Date()
        });
        await device.save();
      }

      // Sign device certificate using CA service
      let certResult = null;
      let certificate = null;
      let certFingerprint = null;
      let certExpiry = null;

      if (csr) {
        // Sign the CSR with our CA
        certResult = caService.signCSR(csr, {
          deviceId: device_id,
          validityDays: 365
        });

        if (certResult) {
          certificate = certResult.certificate;
          certFingerprint = certResult.fingerprint;
          certExpiry = certResult.expiresAt;

          // Store certificate info
          device.certificate = certificate;
          device.certificateExpiry = certExpiry;
          device.certificateFingerprint = certFingerprint;

          if (certResult.selfSigned) {
            console.warn(`⚠️ Device ${device_id} using self-signed certificate (CA not configured)`);
          }
        }
      }

      // Fallback: generate fingerprint-based identifier if no CSR provided
      if (!certFingerprint) {
        certExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
        certFingerprint = crypto
          .createHash('sha256')
          .update(fingerprint + Date.now())
          .digest('hex');

        device.certificateExpiry = certExpiry;
        device.certificateFingerprint = certFingerprint;
        console.warn(`⚠️ Device ${device_id} registered without CSR - no certificate issued`);
      }

      await device.save();

      // Generate tokens
      const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateDeviceTokens(device);

      // Store refresh token
      device.jwtRefreshToken = refreshToken;
      device.jwtRefreshTokenExpiry = refreshExpiry;
      await device.save();

      console.log(`✅ Device ${device_id} registered successfully`);

      // Build response
      const response = {
        success: true,
        device_id: device.getDeviceId(),
        resource_id: device.id,
        certificate_fingerprint: certFingerprint,
        expires_at: certExpiry.toISOString(),
        token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: accessExpiry.toISOString()
      };

      // Include certificate if one was generated
      if (certificate) {
        response.certificate = certificate;
        response.ca_configured = caService.isConfigured();
      }

      res.json(response);

    } catch (error) {
      console.error('🚨 Device registration error:', error);
      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }

  /**
   * POST /device/token
   * Exchange device credentials for JWT token
   */
  async getToken(req, res) {
    try {
      const { device_id, fingerprint, cert_fingerprint } = req.body;

      // Find device
      let device;
      if (cert_fingerprint) {
        device = await FhirDevice.findByCertFingerprint(cert_fingerprint);
      } else if (fingerprint) {
        device = await FhirDevice.findByFingerprint(fingerprint);
      }

      if (!device) {
        return res.status(401).json({
          error: 'Device not found or not registered',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Verify device_id if provided
      if (device_id) {
        const expectedDeviceId = device.getDeviceId();
        if (device_id !== expectedDeviceId) {
          return res.status(401).json({
            error: 'Device ID mismatch',
            code: 'DEVICE_ID_MISMATCH'
          });
        }
      }

      // Generate new tokens
      const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateDeviceTokens(device);

      // Update refresh token
      device.jwtRefreshToken = refreshToken;
      device.jwtRefreshTokenExpiry = refreshExpiry;
      device.lastSeenAt = new Date();
      await device.save();

      console.log(`🔑 Token issued for device ${device.getDeviceId()}`);

      res.json({
        token: accessToken,
        refresh_token: refreshToken,
        expires_at: accessExpiry.toISOString(),
        device_id: device.getDeviceId(),
        can_publish: true,
        can_subscribe: true,
        roles: ['device']
      });

    } catch (error) {
      console.error('🚨 Token generation error:', error);
      res.status(500).json({
        error: 'Token generation failed',
        code: 'TOKEN_ERROR'
      });
    }
  }

  /**
   * POST /device/token/refresh
   * Refresh device access token
   */
  async refreshToken(req, res) {
    try {
      // Device is attached by verifyDeviceRefreshToken middleware
      const device = req.device;

      // Generate new tokens
      const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateDeviceTokens(device);

      // Update refresh token (rotation)
      device.jwtRefreshToken = refreshToken;
      device.jwtRefreshTokenExpiry = refreshExpiry;
      device.lastSeenAt = new Date();
      await device.save();

      console.log(`🔄 Token refreshed for device ${device.getDeviceId()}`);

      res.json({
        token: accessToken,
        refresh_token: refreshToken,
        expires_at: accessExpiry.toISOString(),
        device_id: device.getDeviceId(),
        can_publish: true,
        can_subscribe: true,
        roles: ['device']
      });

    } catch (error) {
      console.error('🚨 Token refresh error:', error);
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR'
      });
    }
  }

  /**
   * GET /device/:id
   * Get device details
   */
  async getDevice(req, res) {
    try {
      const { id } = req.params;

      // Find device by ID or resource ID
      let device = await FhirDevice.findOne({ id });

      if (!device) {
        // Try finding by device_id (fingerprint prefix)
        device = await FhirDevice.findOne({
          'identifier.system': 'urn:brigid:device:fingerprint',
          'identifier.value': { $regex: `^${id.toLowerCase()}`, $options: 'i' }
        });
      }

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Return FHIR-compliant device resource
      res.json({
        resourceType: device.resourceType,
        id: device.id,
        identifier: device.identifier,
        status: device.status,
        manufacturer: device.manufacturer,
        modelNumber: device.modelNumber,
        deviceName: device.deviceName,
        type: device.type,
        owner: device.owner,
        registeredAt: device.registeredAt,
        lastSeenAt: device.lastSeenAt,
        deviceInfo: device.deviceInfo,
        certificateExpiry: device.certificateExpiry,
        needsRenewal: device.needsCertRenewal()
      });

    } catch (error) {
      console.error('🚨 Get device error:', error);
      res.status(500).json({
        error: 'Failed to get device',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * PUT /device/:id
   * Update device details
   */
  async updateDevice(req, res) {
    try {
      const { id } = req.params;
      const { owner, deviceName, deviceInfo, status } = req.body;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Update allowed fields
      if (owner) device.owner = owner;
      if (deviceName) device.deviceName = deviceName;
      if (deviceInfo) device.deviceInfo = { ...device.deviceInfo, ...deviceInfo };
      if (status && ['active', 'inactive'].includes(status)) {
        device.status = status;
      }

      await device.save();

      console.log(`📝 Device ${device.getDeviceId()} updated`);

      res.json({
        success: true,
        device: {
          id: device.id,
          device_id: device.getDeviceId(),
          status: device.status,
          owner: device.owner,
          deviceName: device.deviceName
        }
      });

    } catch (error) {
      console.error('🚨 Update device error:', error);
      res.status(500).json({
        error: 'Failed to update device',
        code: 'UPDATE_ERROR'
      });
    }
  }

  /**
   * POST /device/:id/revoke
   * Revoke device access
   */
  async revokeDevice(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Revoke device
      device.status = 'inactive';
      device.revokedAt = new Date();
      device.revokedReason = reason || 'Manually revoked';
      device.jwtRefreshToken = null;
      device.jwtRefreshTokenExpiry = null;
      await device.save();

      console.log(`🚫 Device ${device.getDeviceId()} revoked: ${reason}`);

      res.json({
        success: true,
        message: 'Device revoked',
        device_id: device.getDeviceId()
      });

    } catch (error) {
      console.error('🚨 Revoke device error:', error);
      res.status(500).json({
        error: 'Failed to revoke device',
        code: 'REVOKE_ERROR'
      });
    }
  }

  /**
   * GET /device
   * List all devices (admin)
   */
  async listDevices(req, res) {
    try {
      const { status, email, limit = 50, offset = 0 } = req.query;

      const query = {};
      if (status) query.status = status;
      if (email) query['owner.email'] = email;

      const devices = await FhirDevice.find(query)
        .sort({ lastSeenAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .select('-certificate -jwtRefreshToken');

      const total = await FhirDevice.countDocuments(query);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: devices.map(device => ({
          resource: {
            resourceType: device.resourceType,
            id: device.id,
            device_id: device.getDeviceId(),
            identifier: device.identifier,
            status: device.status,
            deviceName: device.deviceName,
            owner: device.owner,
            registeredAt: device.registeredAt,
            lastSeenAt: device.lastSeenAt
          }
        }))
      });

    } catch (error) {
      console.error('🚨 List devices error:', error);
      res.status(500).json({
        error: 'Failed to list devices',
        code: 'LIST_ERROR'
      });
    }
  }

  /**
   * POST /device/:id/link
   * Link device to user email
   */
  async linkDevice(req, res) {
    try {
      const { id } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email required',
          code: 'MISSING_EMAIL'
        });
      }

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Link device to user
      device.owner = {
        reference: `User/${email}`,
        email
      };
      await device.save();

      console.log(`🔗 Device ${device.getDeviceId()} linked to ${email}`);

      res.json({
        success: true,
        device_id: device.getDeviceId(),
        linked_to: email
      });

    } catch (error) {
      console.error('🚨 Link device error:', error);
      res.status(500).json({
        error: 'Failed to link device',
        code: 'LINK_ERROR'
      });
    }
  }
}

export default new DeviceController();
