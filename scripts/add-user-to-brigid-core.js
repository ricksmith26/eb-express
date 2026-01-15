/**
 * Add user to Brigid Core organization
 * Run with: node scripts/add-user-to-brigid-core.js <email> [role]
 * Example: node scripts/add-user-to-brigid-core.js ricksmith69@gmail.com org_admin
 */
import connectDB from '../config/db.js';
import FhirOrganization from '../models/FhirOrganization.js';
import FhirPractitioner from '../models/FhirPractitioner.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';

const email = process.argv[2];
const role = process.argv[3] || 'org_admin'; // default to org_admin

if (!email) {
  console.error('Usage: node scripts/add-user-to-brigid-core.js <email> [role]');
  console.error('Roles: super_admin, org_admin, employee');
  process.exit(1);
}

async function addUserToBrigidCore() {
  try {
    await connectDB();

    // 1. Find Brigid Core organization
    const brigidCore = await FhirOrganization.findOne({ name: 'Brigid Core' });
    if (!brigidCore) {
      console.error('Brigid Core organization not found! Run setup-brigid-core.js first.');
      process.exit(1);
    }
    console.log(`Found Brigid Core: ${brigidCore.id}`);

    // 2. Find the practitioner by email
    const practitioner = await FhirPractitioner.findOne({
      $or: [
        { 'telecom.value': email },
        { email: email }
      ]
    });

    if (!practitioner) {
      console.error(`Practitioner with email ${email} not found!`);
      process.exit(1);
    }
    console.log(`Found practitioner: ${practitioner.fullName || practitioner.email} (ID: ${practitioner.id})`);

    // 3. Check if user already has a role in Brigid Core
    const existingRole = await FhirPractitionerRole.findOne({
      'practitioner.reference': `Practitioner/${practitioner.id}`,
      'organization.reference': `Organization/${brigidCore.id}`
    });

    const roleDisplay = {
      super_admin: 'Super Admin',
      org_admin: 'Org Admin',
      employee: 'Employee'
    };

    if (existingRole) {
      console.log(`User already has a role in Brigid Core: ${existingRole.roleCode}`);

      // Update the role if different
      if (existingRole.roleCode !== role) {
        existingRole.code = [{
          coding: [{
            system: 'http://brigid.com/fhir/CodeSystem/admin-role',
            code: role,
            display: roleDisplay[role] || role
          }]
        }];
        existingRole.roleStatus = 'active';
        await existingRole.save();
        console.log(`Updated role to: ${role}`);
      }
    } else {
      // Create new PractitionerRole
      const newRole = new FhirPractitionerRole({
        practitioner: {
          reference: `Practitioner/${practitioner.id}`,
          display: practitioner.fullName || practitioner.email
        },
        organization: {
          reference: `Organization/${brigidCore.id}`,
          display: 'Brigid Core'
        },
        code: [{
          coding: [{
            system: 'http://brigid.com/fhir/CodeSystem/admin-role',
            code: role,
            display: roleDisplay[role] || role
          }]
        }],
        active: true,
        roleStatus: 'active',
        joinedAt: new Date()
      });
      await newRole.save();
      console.log(`Created ${role} role for ${email} in Brigid Core`);
    }

    // 4. Set active organization
    practitioner.activeOrganizationId = brigidCore.id;
    await practitioner.save();
    console.log(`Set active organization to Brigid Core`);

    // 5. Show final state for this user
    const userRoles = await FhirPractitionerRole.find({
      'practitioner.reference': `Practitioner/${practitioner.id}`
    });

    console.log(`\n=== Roles for ${email} ===`);
    userRoles.forEach(r => {
      console.log(`- ${r.roleCode} @ ${r.organization?.display || r.organization?.reference}`);
    });

    console.log('\nDone!');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addUserToBrigidCore();
