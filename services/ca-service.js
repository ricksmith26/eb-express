/**
 * Certificate Authority Service
 * Signs device CSRs with the Brigid CA certificate
 *
 * Setup:
 * 1. Generate CA once: node scripts/generate-ca.js
 * 2. Set environment variables:
 *    - CA_CERT_PATH or CA_CERT (PEM content)
 *    - CA_KEY_PATH or CA_KEY (PEM content, encrypted)
 *    - CA_KEY_PASSPHRASE (if key is encrypted)
 */
import crypto from 'crypto';
import fs from 'fs';
import forge from 'node-forge';

class CAService {
  constructor() {
    this.caCert = null;
    this.caKey = null;
    this.initialized = false;
  }

  /**
   * Initialize the CA service with certificate and key
   */
  initialize() {
    if (this.initialized) return true;

    try {
      // Load CA certificate
      let caCertPem;
      if (process.env.CA_CERT) {
        caCertPem = process.env.CA_CERT.replace(/\\n/g, '\n');
      } else if (process.env.CA_CERT_PATH) {
        caCertPem = fs.readFileSync(process.env.CA_CERT_PATH, 'utf8');
      } else {
        console.warn('[CA] No CA certificate configured - using self-signed mode');
        return false;
      }

      // Load CA private key
      let caKeyPem;
      if (process.env.CA_KEY) {
        caKeyPem = process.env.CA_KEY.replace(/\\n/g, '\n');
      } else if (process.env.CA_KEY_PATH) {
        caKeyPem = fs.readFileSync(process.env.CA_KEY_PATH, 'utf8');
      } else {
        console.warn('[CA] No CA private key configured - using self-signed mode');
        return false;
      }

      // Parse certificate
      this.caCert = forge.pki.certificateFromPem(caCertPem);

      // Parse private key (handle encrypted keys)
      const passphrase = process.env.CA_KEY_PASSPHRASE;
      if (passphrase) {
        this.caKey = forge.pki.decryptRsaPrivateKey(caKeyPem, passphrase);
      } else {
        this.caKey = forge.pki.privateKeyFromPem(caKeyPem);
      }

      if (!this.caKey) {
        throw new Error('Failed to decrypt CA private key - check passphrase');
      }

      this.initialized = true;
      console.log('[CA] Certificate Authority initialized');
      console.log(`[CA] CA Subject: ${this.caCert.subject.getField('CN').value}`);
      console.log(`[CA] CA Valid Until: ${this.caCert.validity.notAfter.toISOString()}`);

      return true;
    } catch (error) {
      console.error('[CA] Failed to initialize:', error.message);
      return false;
    }
  }

  /**
   * Sign a device CSR and return the certificate
   *
   * @param {string} csrPem - PEM-encoded CSR from device
   * @param {object} options - Signing options
   * @param {number} options.validityDays - Certificate validity in days (default: 365)
   * @param {string} options.deviceId - Device identifier for logging
   * @returns {object} - { certificate, fingerprint, expiresAt } or null on error
   */
  signCSR(csrPem, options = {}) {
    const { validityDays = 365, deviceId = 'unknown' } = options;

    // Try to initialize if not already
    if (!this.initialized && !this.initialize()) {
      // Fall back to self-signed certificate
      return this.generateSelfSignedCert(csrPem, options);
    }

    try {
      // Parse CSR
      const csr = forge.pki.certificationRequestFromPem(csrPem);

      // Verify CSR signature
      if (!csr.verify()) {
        throw new Error('CSR signature verification failed');
      }

      // Create certificate
      const cert = forge.pki.createCertificate();

      // Serial number (random, unique)
      cert.serialNumber = crypto.randomBytes(16).toString('hex');

      // Validity period
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validityDays);

      // Subject from CSR
      cert.setSubject(csr.subject.attributes);

      // Issuer from CA certificate
      cert.setIssuer(this.caCert.subject.attributes);

      // Public key from CSR
      cert.publicKey = csr.publicKey;

      // Extensions
      cert.setExtensions([
        {
          name: 'basicConstraints',
          cA: false,
          critical: true
        },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          critical: true
        },
        {
          name: 'extKeyUsage',
          clientAuth: true
        },
        {
          name: 'subjectKeyIdentifier'
        },
        {
          name: 'authorityKeyIdentifier',
          keyIdentifier: true,
          authorityCertIssuer: true,
          serialNumber: true
        }
      ]);

      // Sign with CA private key
      cert.sign(this.caKey, forge.md.sha256.create());

      // Convert to PEM
      const certPem = forge.pki.certificateToPem(cert);

      // Calculate fingerprint
      const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
      const fingerprint = crypto.createHash('sha256')
        .update(Buffer.from(certDer, 'binary'))
        .digest('hex');

      console.log(`[CA] Signed certificate for device ${deviceId}`);
      console.log(`[CA] Fingerprint: ${fingerprint.substring(0, 16)}...`);
      console.log(`[CA] Valid until: ${cert.validity.notAfter.toISOString()}`);

      return {
        certificate: certPem,
        fingerprint,
        expiresAt: cert.validity.notAfter,
        serialNumber: cert.serialNumber,
        issuer: this.caCert.subject.getField('CN').value
      };

    } catch (error) {
      console.error(`[CA] Failed to sign CSR for ${deviceId}:`, error.message);
      return null;
    }
  }

  /**
   * Generate a self-signed certificate (fallback when CA not configured)
   */
  generateSelfSignedCert(csrPem, options = {}) {
    const { validityDays = 365, deviceId = 'unknown' } = options;

    try {
      // Parse CSR
      const csr = forge.pki.certificationRequestFromPem(csrPem);

      // Create self-signed certificate
      const cert = forge.pki.createCertificate();

      cert.serialNumber = crypto.randomBytes(16).toString('hex');
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validityDays);

      // Self-signed: subject = issuer
      cert.setSubject(csr.subject.attributes);
      cert.setIssuer(csr.subject.attributes);
      cert.publicKey = csr.publicKey;

      cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', clientAuth: true }
      ]);

      // We need the private key to sign, but we don't have it
      // Generate a temporary key pair for self-signing
      const keys = forge.pki.rsa.generateKeyPair(2048);
      cert.publicKey = keys.publicKey;
      cert.sign(keys.privateKey, forge.md.sha256.create());

      const certPem = forge.pki.certificateToPem(cert);
      const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
      const fingerprint = crypto.createHash('sha256')
        .update(Buffer.from(certDer, 'binary'))
        .digest('hex');

      console.warn(`[CA] Generated SELF-SIGNED certificate for ${deviceId} (CA not configured)`);

      return {
        certificate: certPem,
        fingerprint,
        expiresAt: cert.validity.notAfter,
        serialNumber: cert.serialNumber,
        issuer: 'self-signed',
        selfSigned: true
      };

    } catch (error) {
      console.error(`[CA] Failed to generate self-signed cert for ${deviceId}:`, error.message);
      return null;
    }
  }

  /**
   * Verify a device certificate was signed by our CA
   */
  verifyCertificate(certPem) {
    if (!this.initialized) {
      console.warn('[CA] Cannot verify - CA not initialized');
      return { valid: false, error: 'CA not initialized' };
    }

    try {
      const cert = forge.pki.certificateFromPem(certPem);

      // Check validity dates
      const now = new Date();
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        return { valid: false, error: 'Certificate expired or not yet valid' };
      }

      // Verify signature
      const verified = this.caCert.verify(cert);
      if (!verified) {
        return { valid: false, error: 'Certificate not signed by this CA' };
      }

      return {
        valid: true,
        subject: cert.subject.getField('CN')?.value,
        expiresAt: cert.validity.notAfter
      };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get CA certificate (for clients to verify server/device certs)
   */
  getCACertificate() {
    if (!this.initialized) return null;
    return forge.pki.certificateToPem(this.caCert);
  }

  /**
   * Check if CA is properly configured
   */
  isConfigured() {
    return this.initialized;
  }
}

// Singleton instance
const caService = new CAService();

export default caService;
export { CAService };
