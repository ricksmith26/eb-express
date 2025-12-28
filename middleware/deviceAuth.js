/**
 * Device Authentication Middleware
 * Handles JWT verification for IoT devices (separate from user auth)
 */
import jwt from 'jsonwebtoken';
import FhirDevice from '../models/FhirDevice.js';
import caService from '../services/ca-service.js';

const { JWT_SECRET, DEVICE_JWT_SECRET } = process.env;

// Use separate secret for devices if available, otherwise fall back to main JWT_SECRET
const getDeviceSecret = () => DEVICE_JWT_SECRET || JWT_SECRET;

/**
 * Verify device JWT access token
 * Similar to verifyAccessToken but for devices
 */
export const verifyDeviceToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Device token required',
        code: 'NO_DEVICE_TOKEN'
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, getDeviceSecret());
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Device token expired',
          code: 'DEVICE_TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        error: 'Invalid device token',
        code: 'INVALID_DEVICE_TOKEN'
      });
    }

    // Check token type
    if (decoded.type !== 'device') {
      return res.status(401).json({
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Verify device still exists and is active
    const device = await FhirDevice.findOne({
      id: decoded.deviceId,
      status: 'active'
    });

    if (!device) {
      return res.status(401).json({
        error: 'Device not found or revoked',
        code: 'DEVICE_REVOKED'
      });
    }

    // Update last seen
    device.lastSeenAt = new Date();
    await device.save();

    // Attach device and token info to request
    req.device = device;
    req.deviceToken = decoded;

    next();
  } catch (error) {
    console.error('🚨 Device auth error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Verify device refresh token
 * Used to issue new access tokens
 */
export const verifyDeviceRefreshToken = async (req, res, next) => {
  try {
    const { refresh_token, device_id } = req.body;

    if (!refresh_token || !device_id) {
      return res.status(400).json({
        error: 'Refresh token and device_id required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, getDeviceSecret());
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Refresh token expired',
          code: 'DEVICE_REFRESH_TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Check token type
    if (decoded.type !== 'device_refresh') {
      return res.status(401).json({
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Find device and verify refresh token matches
    const device = await FhirDevice.findOne({
      id: device_id,
      status: 'active'
    }).select('+jwtRefreshToken');

    if (!device) {
      return res.status(401).json({
        error: 'Device not found or revoked',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Verify refresh token matches stored one
    if (device.jwtRefreshToken !== refresh_token) {
      return res.status(401).json({
        error: 'Refresh token mismatch',
        code: 'REFRESH_TOKEN_MISMATCH'
      });
    }

    // Check if refresh token is expired
    if (device.jwtRefreshTokenExpiry && new Date() > device.jwtRefreshTokenExpiry) {
      return res.status(401).json({
        error: 'Refresh token expired',
        code: 'DEVICE_REFRESH_TOKEN_EXPIRED'
      });
    }

    req.device = device;
    next();
  } catch (error) {
    console.error('🚨 Device refresh auth error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Verify device by hardware fingerprint
 * Used during initial registration/token exchange
 */
export const verifyDeviceFingerprint = async (req, res, next) => {
  try {
    const { device_id, fingerprint } = req.body;

    if (!device_id || !fingerprint) {
      return res.status(400).json({
        error: 'Device ID and fingerprint required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Find device by fingerprint
    const device = await FhirDevice.findByFingerprint(fingerprint);

    if (!device) {
      return res.status(401).json({
        error: 'Device not registered',
        code: 'DEVICE_NOT_REGISTERED'
      });
    }

    // Verify device_id matches
    const expectedDeviceId = fingerprint.substring(0, 16).toUpperCase();
    if (device_id !== expectedDeviceId) {
      return res.status(401).json({
        error: 'Device ID mismatch',
        code: 'DEVICE_ID_MISMATCH'
      });
    }

    req.device = device;
    next();
  } catch (error) {
    console.error('🚨 Device fingerprint verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      code: 'VERIFICATION_ERROR'
    });
  }
};

/**
 * Optional device auth - attaches device if token present, but doesn't require it
 */
export const optionalDeviceAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, getDeviceSecret());

    if (decoded.type === 'device') {
      const device = await FhirDevice.findOne({
        id: decoded.deviceId,
        status: 'active'
      });

      if (device) {
        req.device = device;
        req.deviceToken = decoded;
      }
    }
  } catch (err) {
    // Ignore errors for optional auth
  }

  next();
};

/**
 * Verify device certificate (application-layer mTLS)
 * Used for sensitive operations requiring certificate proof
 */
export const verifyCertificate = async (req, res, next) => {
  try {
    // Certificate can come from nginx header (X-Client-Cert) or request body
    const certPem = req.headers['x-client-cert'] || req.body?.certificate;

    if (!certPem) {
      return res.status(401).json({
        error: 'Client certificate required',
        code: 'CERTIFICATE_REQUIRED'
      });
    }

    // Verify certificate was signed by our CA
    const verification = caService.verifyCertificate(certPem);

    if (!verification.valid) {
      return res.status(401).json({
        error: verification.error || 'Certificate verification failed',
        code: 'CERTIFICATE_INVALID'
      });
    }

    // Extract device ID from certificate CN (format: "Device: DEVICEID")
    const cnMatch = verification.subject?.match(/Device:\s*([A-F0-9]+)/i);
    const certDeviceId = cnMatch ? cnMatch[1] : null;

    // Find device by certificate fingerprint
    const device = await FhirDevice.findByCertFingerprint(verification.fingerprint);

    if (!device) {
      return res.status(401).json({
        error: 'Device not found for certificate',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Verify device ID matches if present in both
    if (certDeviceId && device.getDeviceId() !== certDeviceId) {
      return res.status(401).json({
        error: 'Certificate device ID mismatch',
        code: 'DEVICE_ID_MISMATCH'
      });
    }

    // Attach device and cert info to request
    req.device = device;
    req.certificate = {
      fingerprint: verification.fingerprint,
      subject: verification.subject,
      expiresAt: verification.expiresAt
    };

    next();
  } catch (error) {
    console.error('🚨 Certificate verification error:', error);
    res.status(500).json({
      error: 'Certificate verification failed',
      code: 'CERT_VERIFICATION_ERROR'
    });
  }
};

/**
 * Combined JWT + Certificate verification (strongest auth)
 * Requires both valid JWT token AND matching certificate
 */
export const verifyDeviceWithCert = async (req, res, next) => {
  // First verify JWT token
  await verifyDeviceToken(req, res, async () => {
    // Then verify certificate if CA is configured
    if (caService.isConfigured()) {
      const certPem = req.headers['x-client-cert'] || req.body?.certificate;

      if (certPem) {
        const verification = caService.verifyCertificate(certPem);

        if (verification.valid) {
          // Verify cert fingerprint matches device record
          if (req.device.certificateFingerprint !== verification.fingerprint) {
            return res.status(401).json({
              error: 'Certificate does not match device',
              code: 'CERTIFICATE_MISMATCH'
            });
          }

          req.certificate = {
            fingerprint: verification.fingerprint,
            verified: true
          };
        }
      }
    }

    next();
  });
};

export default {
  verifyDeviceToken,
  verifyDeviceRefreshToken,
  verifyDeviceFingerprint,
  optionalDeviceAuth,
  verifyCertificate,
  verifyDeviceWithCert
};
