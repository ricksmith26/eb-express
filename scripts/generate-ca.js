#!/usr/bin/env node
/**
 * Generate Brigid CA Certificate and Key
 *
 * Usage: node scripts/generate-ca.js [output-dir]
 *
 * This creates:
 *   - brigid-ca.crt (CA certificate - can be distributed)
 *   - brigid-ca.key (CA private key - KEEP SECRET)
 *
 * For production:
 *   1. Run this script ONCE on a secure machine
 *   2. Store brigid-ca.key securely (encrypted, restricted access)
 *   3. Set environment variables on your server:
 *      - CA_CERT_PATH=/path/to/brigid-ca.crt
 *      - CA_KEY_PATH=/path/to/brigid-ca.key
 *      - CA_KEY_PASSPHRASE=your-passphrase (if encrypted)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import forge from 'node-forge';
import readline from 'readline';

const outputDir = process.argv[2] || './certs';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const certPath = path.join(outputDir, 'brigid-ca.crt');
const keyPath = path.join(outputDir, 'brigid-ca.key');

// Check if files already exist
if (fs.existsSync(certPath) || fs.existsSync(keyPath)) {
  console.log('⚠️  CA files already exist!');
  console.log(`   ${certPath}`);
  console.log(`   ${keyPath}`);
  console.log('');
  console.log('Delete them first if you want to regenerate.');
  process.exit(1);
}

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function generateCA() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Brigid CA Certificate Generator                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Get configuration
  const orgName = await askQuestion('Organization name [Brigid Healthcare]: ') || 'Brigid Healthcare';
  const validityYears = parseInt(await askQuestion('Validity in years [10]: ')) || 10;
  const passphrase = await askQuestion('Private key passphrase (leave empty for none): ');

  console.log('');
  console.log('Generating 4096-bit RSA key pair (this may take a moment)...');

  // Generate key pair
  const keys = forge.pki.rsa.generateKeyPair(4096);

  console.log('Creating CA certificate...');

  // Create CA certificate
  const cert = forge.pki.createCertificate();

  // Serial number
  cert.serialNumber = '01';

  // Validity
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + validityYears);

  // Subject and Issuer (same for self-signed CA)
  const attrs = [
    { shortName: 'CN', value: `${orgName} Device CA` },
    { shortName: 'O', value: orgName },
    { shortName: 'OU', value: 'Device Management' },
    { shortName: 'C', value: 'US' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Public key
  cert.publicKey = keys.publicKey;

  // CA extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    }
  ]);

  // Sign with private key
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Convert to PEM
  const certPem = forge.pki.certificateToPem(cert);

  let keyPem;
  if (passphrase) {
    // Encrypt private key
    keyPem = forge.pki.encryptRsaPrivateKey(keys.privateKey, passphrase, {
      algorithm: 'aes256'
    });
  } else {
    keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  }

  // Write files
  fs.writeFileSync(certPath, certPem);
  fs.writeFileSync(keyPath, keyPem);
  fs.chmodSync(keyPath, 0o600); // Restrict key file permissions

  // Calculate fingerprint
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprint = crypto.createHash('sha256')
    .update(Buffer.from(certDer, 'binary'))
    .digest('hex');

  console.log('');
  console.log('✅ CA Certificate Generated Successfully!');
  console.log('');
  console.log('Files created:');
  console.log(`  📜 Certificate: ${certPath}`);
  console.log(`  🔐 Private Key: ${keyPath}${passphrase ? ' (encrypted)' : ''}`);
  console.log('');
  console.log('Certificate Details:');
  console.log(`  Subject:     ${orgName} Device CA`);
  console.log(`  Valid From:  ${cert.validity.notBefore.toISOString()}`);
  console.log(`  Valid Until: ${cert.validity.notAfter.toISOString()}`);
  console.log(`  Fingerprint: ${fingerprint}`);
  console.log('');
  console.log('Environment variables for eb-express:');
  console.log(`  CA_CERT_PATH=${path.resolve(certPath)}`);
  console.log(`  CA_KEY_PATH=${path.resolve(keyPath)}`);
  if (passphrase) {
    console.log(`  CA_KEY_PASSPHRASE=<your-passphrase>`);
  }
  console.log('');
  console.log('⚠️  IMPORTANT: Keep the private key secure!');
  console.log('   - Never commit it to version control');
  console.log('   - Restrict file permissions (already set to 0600)');
  console.log('   - Consider using a secrets manager in production');
}

generateCA().catch(console.error);
