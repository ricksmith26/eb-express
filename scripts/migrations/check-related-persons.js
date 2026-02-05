/**
 * Check RelatedPerson data structure for Richard Smith
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import RelatedPerson from '../../models/RelatedPerson.js';

dotenv.config();

async function checkRelatedPersons() {
    try {
        await mongoose.connect(process.env.MONGO_DB_URL);
        console.log('✓ Connected to MongoDB\n');

        const patientId = '67d58ddacc4bff084cb803fa';

        const relatedPersons = await RelatedPerson.find({
            'patient.reference': {
                $in: [
                    `Patient/${patientId}`,
                    patientId
                ]
            }
        });

        console.log(`Found ${relatedPersons.length} related persons:\n`);
        console.log('═══════════════════════════════════════════════════\n');

        relatedPersons.forEach((rp, i) => {
            console.log(`\n📋 Related Person ${i + 1}:`);
            console.log('─────────────────────────────────────────────────');
            console.log('ID:', rp.id || rp._id);
            console.log('Name:', rp.name?.[0]?.given?.[0], rp.name?.[0]?.family);
            console.log('\nRelationship:');
            console.log(JSON.stringify(rp.relationship, null, 2));
            console.log('\nTelecom:');
            console.log(JSON.stringify(rp.telecom, null, 2));
            console.log('\nPatient Reference:', rp.patient?.reference);
            console.log('─────────────────────────────────────────────────');
        });

        console.log('\n═══════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

checkRelatedPersons()
    .then(() => {
        console.log('✅ Check completed');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
