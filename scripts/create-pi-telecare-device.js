/**
 * Create telecare device record for Brigid Pi hardware fingerprint
 * Links to same patient as TC-1000
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;

const HARDWARE_FINGERPRINT = 'A10C87143249C1A1';
const TC1000_DEVICE_ID = 'TC-1000';

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Get TC-1000 patient and organization
        console.log(`Fetching TC-1000 device details...`);
        const tc1000Result = await pool.query(
            'SELECT patient_id, organization_id FROM telecare_devices WHERE device_id = $1',
            [TC1000_DEVICE_ID]
        );

        if (tc1000Result.rows.length === 0) {
            console.error(`TC-1000 device not found in database`);
            process.exit(1);
        }

        const { patient_id, organization_id } = tc1000Result.rows[0];
        console.log(`Found TC-1000: patient_id=${patient_id}, organization_id=${organization_id}`);

        // Check if device already exists
        const existingResult = await pool.query(
            'SELECT device_id FROM telecare_devices WHERE device_id = $1',
            [HARDWARE_FINGERPRINT]
        );

        if (existingResult.rows.length > 0) {
            console.log(`Device ${HARDWARE_FINGERPRINT} already exists, skipping creation`);
            process.exit(0);
        }

        // Create the device
        console.log(`Creating telecare device with fingerprint ${HARDWARE_FINGERPRINT}...`);
        const insertResult = await pool.query(`
            INSERT INTO telecare_devices (
                device_id,
                device_type,
                device_model,
                patient_id,
                organization_id,
                notes,
                is_active,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            RETURNING *
        `, [
            HARDWARE_FINGERPRINT,
            'telecare-device',
            'Brigid Pi',
            patient_id,
            organization_id,
            'Brigid Pi device - linked to same patient as TC-1000',
            true
        ]);

        console.log(`\n✓ Device created successfully:`);
        console.log(`  Device ID: ${insertResult.rows[0].device_id}`);
        console.log(`  Patient ID: ${insertResult.rows[0].patient_id}`);
        console.log(`  Organization ID: ${insertResult.rows[0].organization_id}`);
        console.log(`  Model: ${insertResult.rows[0].device_model}`);
        console.log(`  Active: ${insertResult.rows[0].is_active}`);
        console.log(`\nThe Pi can now report power status using device ID: ${HARDWARE_FINGERPRINT}`);

    } catch (error) {
        console.error('Error creating device:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
