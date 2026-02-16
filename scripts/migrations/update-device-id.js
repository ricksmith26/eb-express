/**
 * Update device ID from old hardware fingerprint to new one.
 *
 * When a Pi is reset for a new patient, the hardware fingerprint can change
 * (e.g., if the SD card or key derivation input changes). This script updates
 * both PostgreSQL and MongoDB to use the new device ID.
 *
 * Run on the server with:
 *   node scripts/migrations/update-device-id.js
 *
 * After running, clear stale certs on the Pi:
 *   ssh brigid-admin@192.168.0.64 "rm -f ~/.brigid/certs/* ~/.brigid/secure_store.json"
 *   Then restart the app so it re-registers with the new device ID.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import pool from '../../config/postgres.js';

dotenv.config();

const OLD_DEVICE_ID = 'A10C87143249C1A1';
const NEW_DEVICE_ID = '0585B68A81FEA8DF';

async function updateDeviceId() {
    console.log('════════════════════════════════════════════');
    console.log('  Device ID Migration');
    console.log('════════════════════════════════════════════');
    console.log(`  Old: ${OLD_DEVICE_ID}`);
    console.log(`  New: ${NEW_DEVICE_ID}`);
    console.log('');

    let pgClient;
    try {
        // Connect to both databases
        console.log('Connecting to databases...');
        pgClient = await pool.connect();
        await mongoose.connect(process.env.MONGO_DB_URL);
        console.log('Connected to PostgreSQL and MongoDB\n');

        // ── Step 1: PostgreSQL telecare_devices ──
        console.log('Step 1: Updating PostgreSQL telecare_devices...');

        const pgResult = await pgClient.query(
            'UPDATE telecare_devices SET device_id = $1, updated_at = NOW() WHERE device_id = $2 RETURNING device_id, patient_id',
            [NEW_DEVICE_ID, OLD_DEVICE_ID]
        );

        if (pgResult.rowCount > 0) {
            const row = pgResult.rows[0];
            console.log(`  Updated: device_id=${row.device_id}, patient_id=${row.patient_id}`);
        } else {
            console.log(`  No row found with device_id=${OLD_DEVICE_ID} (may already be updated)`);
        }

        // ── Step 2: MongoDB FhirDevice ──
        console.log('\nStep 2: Updating MongoDB fhirdevices...');

        const FhirDevice = mongoose.connection.collection('fhirdevices');

        // Find the device by old fingerprint
        const device = await FhirDevice.findOne({
            'identifier.system': 'urn:brigid:device:fingerprint',
            'identifier.value': OLD_DEVICE_ID
        });

        if (device) {
            // Update fingerprint and clear certificate so device re-registers
            const updateResult = await FhirDevice.updateOne(
                { _id: device._id },
                {
                    $set: {
                        'identifier.$[elem].value': NEW_DEVICE_ID,
                        certificate: null,
                        certificateExpiry: null,
                        certificateFingerprint: null,
                        jwtRefreshToken: null,
                        jwtRefreshTokenExpiry: null,
                        updatedAt: new Date()
                    }
                },
                {
                    arrayFilters: [{ 'elem.system': 'urn:brigid:device:fingerprint' }]
                }
            );

            console.log(`  Updated device ${device._id}: fingerprint=${NEW_DEVICE_ID}`);
            console.log(`  Cleared certificate and refresh token (device will re-register)`);
        } else {
            console.log(`  No device found with fingerprint=${OLD_DEVICE_ID} (may already be updated)`);
        }

        // ── Summary ──
        console.log('\n════════════════════════════════════════════');
        console.log('  Migration complete');
        console.log('════════════════════════════════════════════');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Clear stale certs on Pi:');
        console.log('     ssh brigid-admin@192.168.0.64 "rm -f ~/.brigid/certs/* ~/.brigid/secure_store.json"');
        console.log('  2. Restart the Pi app so it re-registers');
        console.log('');

    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (pgClient) pgClient.release();
        await mongoose.disconnect();
        await pool.end();
    }
}

updateDeviceId();
