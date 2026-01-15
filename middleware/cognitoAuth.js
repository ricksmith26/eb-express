/**
 * AWS Cognito Authentication Middleware
 * Third auth flow for admin portal (alongside device auth and Google OAuth)
 *
 * Verifies Cognito JWT tokens and attaches practitioner to request
 */
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import FhirPractitioner from '../models/FhirPractitioner.js';

const {
  COGNITO_USER_POOL_ID,
  COGNITO_REGION,
  COGNITO_CLIENT_ID
} = process.env;

// JWKS client for verifying Cognito JWT signatures
// Caches keys to avoid repeated network requests
let client = null;

const getJwksClient = () => {
  if (!client && COGNITO_USER_POOL_ID && COGNITO_REGION) {
    client = jwksClient({
      jwksUri: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000 // 10 minutes
    });
  }
  return client;
};

/**
 * Get signing key from JWKS
 */
const getSigningKey = (header, callback) => {
  const jwks = getJwksClient();
  if (!jwks) {
    return callback(new Error('Cognito not configured'));
  }

  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
};

/**
 * Verify Cognito ID token and attach practitioner to request
 *
 * Sets:
 * - req.cognitoUser: Raw Cognito claims
 * - req.practitioner: FhirPractitioner document
 */
export const verifyCognitoToken = async (req, res, next) => {
  try {
    // Check for required environment variables
    if (!COGNITO_USER_POOL_ID || !COGNITO_REGION) {
      console.error('Cognito environment variables not configured');
      return res.status(500).json({
        error: 'Authentication service not configured',
        code: 'COGNITO_NOT_CONFIGURED'
      });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT with Cognito public keys
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getSigningKey,
        {
          issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
          ...(COGNITO_CLIENT_ID && { audience: COGNITO_CLIENT_ID })
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        }
      );
    });

    // Attach Cognito claims
    req.cognitoUser = {
      sub: decoded.sub,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      username: decoded['cognito:username'],
      groups: decoded['cognito:groups'] || []
    };

    // Look up Practitioner by Cognito sub
    const practitioner = await FhirPractitioner.findByCognitoSub(decoded.sub);

    if (!practitioner) {
      // User exists in Cognito but not registered in our system
      // This could be a first-time login - allow registration endpoint
      req.practitioner = null;
      return next();
    }

    if (practitioner.accountStatus === 'suspended') {
      return res.status(403).json({
        error: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    if (practitioner.accountStatus === 'deactivated') {
      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Update last login time (non-blocking)
    FhirPractitioner.updateOne(
      { id: practitioner.id },
      { lastLoginAt: new Date() }
    ).catch(err => console.error('Failed to update lastLoginAt:', err));

    req.practitioner = practitioner;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.message === 'Cognito not configured') {
      return res.status(500).json({
        error: 'Authentication service not configured',
        code: 'COGNITO_NOT_CONFIGURED'
      });
    }

    console.error('Cognito auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Require practitioner to exist (must be registered)
 * Use after verifyCognitoToken for endpoints that require a registered user
 */
export const requirePractitioner = (req, res, next) => {
  if (!req.practitioner) {
    return res.status(401).json({
      error: 'User not registered in admin portal',
      code: 'NOT_REGISTERED'
    });
  }

  if (req.practitioner.accountStatus !== 'active') {
    return res.status(403).json({
      error: `Account ${req.practitioner.accountStatus}`,
      code: 'ACCOUNT_INACTIVE'
    });
  }

  next();
};

/**
 * Optional Cognito auth - attaches practitioner if token present
 * Does not fail if no token is provided
 */
export const optionalCognitoAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    // Attempt to verify but don't fail on error
    await verifyCognitoToken(req, res, () => {});
    next();
  } catch {
    // Ignore errors for optional auth
    next();
  }
};

export default {
  verifyCognitoToken,
  requirePractitioner,
  optionalCognitoAuth
};
