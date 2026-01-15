/**
 * Delete Practitioner Script
 * Removes a practitioner from Cognito and the database
 *
 * Usage: node scripts/delete-practitioner.js <email>
 */
import 'dotenv/config';
import connectDB from '../config/db.js';
import FhirPractitioner from '../models/FhirPractitioner.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';
import cognitoService from '../services/cognito-service.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/delete-practitioner.js <email>');
  process.exit(1);
}

async function deletePractitioner() {
  try {
    await connectDB();
    console.log(`\nDeleting practitioner: ${email}\n`);

    // Find practitioner
    const practitioner = await FhirPractitioner.findByEmail(email);

    if (practitioner) {
      console.log(`Found practitioner: ${practitioner.id}`);

      // Delete PractitionerRoles
      const roles = await FhirPractitionerRole.find({
        'practitioner.reference': `Practitioner/${practitioner.id}`
      });

      for (const role of roles) {
        await FhirPractitionerRole.deleteOne({ id: role.id });
        console.log(`  Deleted role: ${role.roleCode} in org ${role.organizationId}`);
      }

      // Delete Practitioner
      await FhirPractitioner.deleteOne({ id: practitioner.id });
      console.log(`  Deleted practitioner record`);
    } else {
      console.log('No practitioner found in database');
    }

    // Delete from Cognito
    try {
      await cognitoService.deleteUser(email);
      console.log(`  Deleted Cognito user`);
    } catch (cognitoError) {
      if (cognitoError.name === 'UserNotFoundException') {
        console.log('  No Cognito user found');
      } else {
        throw cognitoError;
      }
    }

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

deletePractitioner();
