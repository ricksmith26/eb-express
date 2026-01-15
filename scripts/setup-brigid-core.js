/**
 * Setup Script: Create Brigid Core organization and fix super admin role
 * Run with: node scripts/setup-brigid-core.js
 */
import connectDB from '../config/db.js';
import FhirOrganization from '../models/FhirOrganization.js';
import FhirPractitioner from '../models/FhirPractitioner.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';

async function setup() {
  try {
    // Connect to MongoDB using existing config
    await connectDB();

    // 1. Check existing practitioners
    const practitioners = await FhirPractitioner.find({});
    console.log('\n=== Practitioners ===');
    practitioners.forEach(p => {
      console.log(`- ${p.email} (ID: ${p.id})`);
    });

    // 2. Check existing roles
    const roles = await FhirPractitionerRole.find({});
    console.log('\n=== Practitioner Roles ===');
    roles.forEach(r => {
      console.log(`- ${r.practitioner?.reference} | Role: ${r.roleCode} | Org: ${r.organization?.reference || 'NONE'}`);
    });

    // 3. Create Brigid Core organization
    let brigidCore = await FhirOrganization.findOne({ name: 'Brigid Core' });

    if (!brigidCore) {
      brigidCore = new FhirOrganization({
        name: 'Brigid Core',
        identifier: [{ system: 'urn:brigid:org:slug', value: 'brigid-core' }],
        active: true,
        type: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'prov',
            display: 'Healthcare Provider'
          }]
        }]
      });
      await brigidCore.save();
      console.log('\n Created Brigid Core organization:', brigidCore.id);
    } else {
      console.log('\n Brigid Core already exists:', brigidCore.id);
    }

    // 4. Fix super_admin role - add organization reference if missing
    const superAdminRoles = await FhirPractitionerRole.find({
      'code.coding.code': 'super_admin'
    });

    for (const role of superAdminRoles) {
      if (!role.organization?.reference) {
        role.organization = {
          reference: `Organization/${brigidCore.id}`,
          display: 'Brigid Core'
        };
        await role.save();
        console.log(`\n Fixed super_admin role for: ${role.practitioner?.reference}`);
      }
    }

    // 5. Give the user (denissmith262626@gmail.com) super_admin access to Brigid Core
    const denis = await FhirPractitioner.findOne({
      'telecom.value': 'denissmith262626@gmail.com'
    });

    if (denis) {
      // Check if user already has a super_admin role
      const existingSuperAdminRole = await FhirPractitionerRole.findOne({
        'practitioner.reference': `Practitioner/${denis.id}`,
        'code.coding.code': 'super_admin'
      });

      if (!existingSuperAdminRole) {
        // Create super_admin role for this user
        const superAdminRole = new FhirPractitionerRole({
          practitioner: {
            reference: `Practitioner/${denis.id}`,
            display: denis.fullName || denis.email
          },
          organization: {
            reference: `Organization/${brigidCore.id}`,
            display: 'Brigid Core'
          },
          code: [{
            coding: [{
              system: 'http://brigid.com/fhir/CodeSystem/admin-role',
              code: 'super_admin',
              display: 'Super Admin'
            }]
          }],
          active: true,
          joinedAt: new Date()
        });
        await superAdminRole.save();
        console.log(`\n Created super_admin role for: ${denis.email}`);
      } else {
        console.log(`\n User ${denis.email} already has super_admin role`);
        // Ensure it has org reference
        if (!existingSuperAdminRole.organization?.reference) {
          existingSuperAdminRole.organization = {
            reference: `Organization/${brigidCore.id}`,
            display: 'Brigid Core'
          };
          await existingSuperAdminRole.save();
          console.log(`\n Added Brigid Core org reference to existing super_admin role`);
        }
      }

      // Set active organization
      denis.activeOrganizationId = brigidCore.id;
      await denis.save();
      console.log(`\n Set active organization for ${denis.email} to Brigid Core`);
    } else {
      console.log('\n User denissmith262626@gmail.com not found!');
    }

    // 6. Final state
    console.log('\n=== Final State ===');
    const finalRoles = await FhirPractitionerRole.find({});
    finalRoles.forEach(r => {
      console.log(`- ${r.practitioner?.reference} | Role: ${r.roleCode} | Org: ${r.organization?.reference}`);
    });

    const orgs = await FhirOrganization.find({});
    console.log('\n=== Organizations ===');
    orgs.forEach(o => {
      console.log(`- ${o.name} (ID: ${o.id}, Active: ${o.active})`);
    });

    console.log('\n Setup complete!');
    process.exit(0);

  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
