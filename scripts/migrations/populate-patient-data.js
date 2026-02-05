/**
 * Populate patient data from MongoDB to PostgreSQL telecare_devices table
 *
 * Fetches Richard Smith's patient data from MongoDB and populates it into
 * the PostgreSQL telecare_devices table for device A10C87143249C1A1.
 *
 * This is required for Asterisk PABX AGI scripts that query patient data
 * during live emergency calls.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import mongoose from 'mongoose';
import Patient from '../../models/PatientSchema.js';
import RelatedPerson from '../../models/RelatedPerson.js';

dotenv.config();
const { Pool } = pg;

const DEVICE_ID = 'A10C87143249C1A1';

async function populatePatientData() {
    console.log('🔧 Starting patient data population...\n');

    // Connect to PostgreSQL
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_DB_URL);
        console.log('✓ MongoDB connected\n');

        // Get device A10C87143249C1A1
        console.log(`🔍 Looking up device: ${DEVICE_ID}`);
        const deviceResult = await pool.query(
            'SELECT device_id, patient_id, device_type, device_model FROM telecare_devices WHERE device_id = $1',
            [DEVICE_ID]
        );

        if (deviceResult.rows.length === 0) {
            throw new Error(`Device ${DEVICE_ID} not found in PostgreSQL telecare_devices table`);
        }

        const device = deviceResult.rows[0];
        console.log(`✓ Found device: ${device.device_id}`);
        console.log(`  Type: ${device.device_type}`);
        console.log(`  Model: ${device.device_model}`);
        console.log(`  Patient ID: ${device.patient_id}\n`);

        // Get patient from MongoDB
        console.log('🔍 Looking up patient in MongoDB...');
        let patient = await Patient.findOne({ id: device.patient_id });
        if (!patient) {
            patient = await Patient.findById(device.patient_id);
        }

        if (!patient) {
            throw new Error(`Patient not found with ID: ${device.patient_id}`);
        }

        const patientFullName = `${patient.name[0].given[0]} ${patient.name[0].family}`;
        console.log(`✓ Found patient: ${patientFullName}`);
        console.log(`  FHIR ID: ${patient.id || patient._id}\n`);

        // Get related persons (emergency contacts)
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

        // Extract patient data
        console.log('📋 Extracting patient data...');
        const userName = `${patient.name[0].given[0]} ${patient.name[0].family}`;
        const userAddress = patient.address && patient.address[0]
            ? `${patient.address[0].line?.join(', ') || ''}, ${patient.address[0].city || ''}, ${patient.address[0].postalCode || ''}`.trim()
            : null;
        const userPhone = patient.telecom?.find(t => t.system === 'phone')?.value || null;
        const gpName = patient.medicalInfo?.gpPractice || null;
        const gpPhone = patient.medicalInfo?.gpPhone || null;

        // Find emergency and secondary contacts
        const emergencyContact = relatedPersons.find(rp =>
            rp.relationship?.[0]?.coding?.[0]?.code === 'emergency' ||
            rp.relationship?.[0]?.coding?.[0]?.display?.toLowerCase().includes('emergency')
        );
        const secondaryContact = relatedPersons.find(rp =>
            rp.relationship?.[0]?.coding?.[0]?.code === 'secondary' ||
            rp.relationship?.[0]?.coding?.[0]?.display?.toLowerCase().includes('secondary')
        );

        const emergencyContactName = emergencyContact?.name?.[0]
            ? `${emergencyContact.name[0].given[0]} ${emergencyContact.name[0].family}`
            : null;
        const emergencyContactPhone = emergencyContact?.telecom?.find(t => t.system === 'phone')?.value || null;
        const emergencyContactRelationship = emergencyContact?.relationship?.[0]?.coding?.[0]?.display || null;

        const secondaryContactName = secondaryContact?.name?.[0]
            ? `${secondaryContact.name[0].given[0]} ${secondaryContact.name[0].family}`
            : null;
        const secondaryContactPhone = secondaryContact?.telecom?.find(t => t.system === 'phone')?.value || null;

        console.log('✓ Data extracted:');
        console.log(`  Name: ${userName}`);
        console.log(`  Address: ${userAddress || 'N/A'}`);
        console.log(`  Phone: ${userPhone || 'N/A'}`);
        console.log(`  Emergency Contact: ${emergencyContactName || 'N/A'} (${emergencyContactPhone || 'N/A'})`);
        console.log(`  Secondary Contact: ${secondaryContactName || 'N/A'} (${secondaryContactPhone || 'N/A'})`);
        console.log(`  GP: ${gpName || 'N/A'} (${gpPhone || 'N/A'})\n`);

        // Update PostgreSQL
        console.log('💾 Updating PostgreSQL telecare_devices table...');
        const updateResult = await pool.query(`
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
        console.log('═══════════════════════════════════════════════════');
        console.log('✅ Patient data populated successfully!');
        console.log('═══════════════════════════════════════════════════');
        console.log(`Device ID: ${updateResult.rows[0].device_id}`);
        console.log(`User Name: ${updateResult.rows[0].user_name}`);
        console.log(`User Address: ${updateResult.rows[0].user_address || 'N/A'}`);
        console.log(`User Phone: ${updateResult.rows[0].user_phone || 'N/A'}`);
        console.log(`Emergency Contact: ${updateResult.rows[0].emergency_contact_name || 'N/A'}`);
        console.log(`Emergency Phone: ${updateResult.rows[0].emergency_contact_phone || 'N/A'}`);
        console.log(`Secondary Contact: ${updateResult.rows[0].secondary_contact_name || 'N/A'}`);
        console.log(`GP: ${updateResult.rows[0].gp_name || 'N/A'}`);
        console.log('═══════════════════════════════════════════════════\n');

        console.log('✅ Device configuration unchanged:');
        console.log(`  Device ID: ${updateResult.rows[0].device_id} ✓`);
        console.log(`  Device Type: ${updateResult.rows[0].device_type} ✓`);
        console.log(`  Device Model: ${updateResult.rows[0].device_model} ✓`);
        console.log(`  Patient ID: ${updateResult.rows[0].patient_id} ✓`);
        console.log(`  Active: ${updateResult.rows[0].is_active} ✓\n`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    } finally {
        await pool.end();
        await mongoose.disconnect();
        console.log('📡 Connections closed');
    }
}

populatePatientData()
    .then(() => {
        console.log('\n✅ Migration completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Migration failed:', err.message);
        process.exit(1);
    });
