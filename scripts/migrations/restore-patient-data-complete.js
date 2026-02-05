/**
 * Complete patient data restoration script
 *
 * This script:
 * 1. Adds patient contact columns back to telecare_devices table
 * 2. Fetches Richard Smith's data from MongoDB
 * 3. Populates the data for device A10C87143249C1A1
 *
 * Run this on the server with: node scripts/migrations/restore-patient-data-complete.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import pool from '../../config/postgres.js';
import Patient from '../../models/PatientSchema.js';
import RelatedPerson from '../../models/RelatedPerson.js';

dotenv.config();

const DEVICE_ID = 'A10C87143249C1A1';

async function restorePatientData() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔧 Patient Data Restoration for Asterisk PABX');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        console.log('📡 Connecting to databases...');
        const pgClient = await pool.connect();
        await mongoose.connect(process.env.MONGO_DB_URL);
        console.log('✓ Connected to PostgreSQL and MongoDB\n');

        // Step 1: Add columns
        console.log('═══════════════════════════════════════════════════');
        console.log('STEP 1: Adding patient contact columns');
        console.log('═══════════════════════════════════════════════════\n');

        await pgClient.query(`
            ALTER TABLE telecare_devices
                ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS user_address VARCHAR(500),
                ADD COLUMN IF NOT EXISTS user_phone VARCHAR(20),
                ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
                ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50),
                ADD COLUMN IF NOT EXISTS secondary_contact_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(20),
                ADD COLUMN IF NOT EXISTS gp_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS gp_phone VARCHAR(20)
        `);

        console.log('✓ Columns added successfully\n');

        // Verify columns
        const verifyResult = await pgClient.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'telecare_devices'
            AND column_name IN (
                'user_name', 'user_address', 'user_phone',
                'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
                'secondary_contact_name', 'secondary_contact_phone',
                'gp_name', 'gp_phone'
            )
            ORDER BY column_name
        `);

        console.log('✅ Verified columns exist:');
        verifyResult.rows.forEach(row => {
            console.log(`  ✓ ${row.column_name}`);
        });
        console.log();

        // Step 2: Fetch patient data
        console.log('═══════════════════════════════════════════════════');
        console.log('STEP 2: Fetching patient data from MongoDB');
        console.log('═══════════════════════════════════════════════════\n');

        console.log(`🔍 Looking up device: ${DEVICE_ID}`);
        const deviceResult = await pgClient.query(
            'SELECT device_id, patient_id, device_type, device_model FROM telecare_devices WHERE device_id = $1',
            [DEVICE_ID]
        );

        if (deviceResult.rows.length === 0) {
            throw new Error(`Device ${DEVICE_ID} not found in PostgreSQL`);
        }

        const device = deviceResult.rows[0];
        console.log(`✓ Found device: ${device.device_id}`);
        console.log(`  Type: ${device.device_type}`);
        console.log(`  Model: ${device.device_model}`);
        console.log(`  Patient ID: ${device.patient_id}\n`);

        console.log('🔍 Looking up patient in MongoDB...');
        let patient = await Patient.findOne({ id: device.patient_id });
        if (!patient) {
            patient = await Patient.findById(device.patient_id);
        }

        if (!patient) {
            throw new Error(`Patient not found with ID: ${device.patient_id}`);
        }

        const patientFullName = `${patient.name[0].given[0]} ${patient.name[0].family}`;
        console.log(`✓ Found patient: ${patientFullName}\n`);

        console.log('🔍 Looking up emergency contacts...');
        const patientFhirId = patient.id || patient._id;
        const relatedPersons = await RelatedPerson.find({
            'patient.reference': {
                $in: [
                    `Patient/${patientFhirId}`,
                    `Patient/${patient._id}`,
                    `Patient/${patient.id}`
                ]
            }
        });
        console.log(`✓ Found ${relatedPersons.length} related persons\n`);

        // Step 3: Extract data
        console.log('═══════════════════════════════════════════════════');
        console.log('STEP 3: Extracting and formatting patient data');
        console.log('═══════════════════════════════════════════════════\n');

        const userName = `${patient.name[0].given[0]} ${patient.name[0].family}`;
        const userAddress = patient.address && patient.address[0]
            ? `${patient.address[0].line?.join(', ') || ''}, ${patient.address[0].city || ''}, ${patient.address[0].postalCode || ''}`.trim()
            : null;
        const userPhone = patient.telecom?.find(t => t.system === 'phone')?.value || null;
        const gpName = patient.medicalInfo?.gpPractice || null;
        const gpPhone = patient.medicalInfo?.gpPhone || null;

        // Use all related persons - first as emergency, second as secondary
        const emergencyContact = relatedPersons.length > 0 ? relatedPersons[0] : null;
        const secondaryContact = relatedPersons.length > 1 ? relatedPersons[1] : null;

        const emergencyContactName = emergencyContact?.name?.[0]
            ? `${emergencyContact.name[0].given[0]} ${emergencyContact.name[0].family}`
            : null;
        const emergencyContactPhone = emergencyContact?.telecom?.find(t => t.system === 'phone')?.value || null;
        const emergencyContactRelationship = emergencyContact?.relationship?.[0]?.coding?.[0]?.display || null;

        const secondaryContactName = secondaryContact?.name?.[0]
            ? `${secondaryContact.name[0].given[0]} ${secondaryContact.name[0].family}`
            : null;
        const secondaryContactPhone = secondaryContact?.telecom?.find(t => t.system === 'phone')?.value || null;

        console.log('Data to populate:');
        console.log(`  Name: ${userName}`);
        console.log(`  Address: ${userAddress || 'N/A'}`);
        console.log(`  Phone: ${userPhone || 'N/A'}`);
        console.log(`  Emergency Contact: ${emergencyContactName || 'N/A'} (${emergencyContactPhone || 'N/A'})`);
        console.log(`  Emergency Relationship: ${emergencyContactRelationship || 'N/A'}`);
        console.log(`  Secondary Contact: ${secondaryContactName || 'N/A'} (${secondaryContactPhone || 'N/A'})`);
        console.log(`  GP: ${gpName || 'N/A'} (${gpPhone || 'N/A'})\n`);

        // Step 4: Update PostgreSQL
        console.log('═══════════════════════════════════════════════════');
        console.log('STEP 4: Updating PostgreSQL telecare_devices table');
        console.log('═══════════════════════════════════════════════════\n');

        const updateResult = await pgClient.query(`
            UPDATE telecare_devices
            SET
                user_name = $1,
                user_address = $2,
                user_phone = $3,
                emergency_contact_name = $4,
                emergency_contact_phone = $5,
                emergency_contact_relationship = $6,
                secondary_contact_name = $7,
                secondary_contact_phone = $8,
                gp_name = $9,
                gp_phone = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $11
            RETURNING *
        `, [
            userName,
            userAddress,
            userPhone,
            emergencyContactName,
            emergencyContactPhone,
            emergencyContactRelationship,
            secondaryContactName,
            secondaryContactPhone,
            gpName,
            gpPhone,
            DEVICE_ID
        ]);

        if (updateResult.rows.length === 0) {
            throw new Error(`Failed to update device ${DEVICE_ID}`);
        }

        console.log('✓ PostgreSQL updated successfully\n');

        // Final summary
        console.log('═══════════════════════════════════════════════════');
        console.log('✅ PATIENT DATA POPULATED SUCCESSFULLY');
        console.log('═══════════════════════════════════════════════════\n');

        const result = updateResult.rows[0];
        console.log('📋 Patient Information:');
        console.log(`  Name: ${result.user_name}`);
        console.log(`  Address: ${result.user_address || 'N/A'}`);
        console.log(`  Phone: ${result.user_phone || 'N/A'}`);
        console.log(`  Emergency Contact: ${result.emergency_contact_name || 'N/A'} (${result.emergency_contact_phone || 'N/A'})`);
        console.log(`  Emergency Relationship: ${result.emergency_contact_relationship || 'N/A'}`);
        console.log(`  Secondary Contact: ${result.secondary_contact_name || 'N/A'} (${result.secondary_contact_phone || 'N/A'})`);
        console.log(`  GP: ${result.gp_name || 'N/A'} (${result.gp_phone || 'N/A'})\n`);

        console.log('🔧 Device Configuration (UNCHANGED):');
        console.log(`  Device ID: ${result.device_id} ✓`);
        console.log(`  Device Type: ${result.device_type} ✓`);
        console.log(`  Device Model: ${result.device_model} ✓`);
        console.log(`  Patient ID: ${result.patient_id} ✓`);
        console.log(`  Active: ${result.is_active} ✓\n`);

        console.log('═══════════════════════════════════════════════════');
        console.log('✅ RESTORATION COMPLETE');
        console.log('═══════════════════════════════════════════════════\n');

        console.log('Next steps:');
        console.log('1. ✓ Patient data is now in PostgreSQL');
        console.log('2. ✓ Asterisk AGI scripts can query this data');
        console.log('3. Test: SSH to Asterisk server and run:');
        console.log('   cd /var/lib/asterisk/agi-bin/');
        console.log(`   ./lookup-telecare-device.py ${DEVICE_ID}\n`);

        pgClient.release();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('📡 Database connections closed');
    }
}

restorePatientData()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Script failed:', err.message);
        process.exit(1);
    });
