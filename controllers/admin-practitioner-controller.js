/**
 * Admin Practitioner Controller
 * Handles practitioner (employee) management for the admin portal
 */
import FhirPractitioner from '../models/FhirPractitioner.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';
import FhirOrganization from '../models/FhirOrganization.js';
import cognitoService from '../services/cognito-service.js';

class AdminPractitionerController {

  /**
   * GET /admin/practitioners
   * List practitioners in the current organization
   */
  async list(req, res) {
    try {
      const { organizationId, practitionerRole } = req;
      const { search, role, status, limit = 50, offset = 0 } = req.query;

      // Build query for roles in this org
      const roleQuery = {
        'organization.reference': `Organization/${organizationId}`,
        active: true,
        roleStatus: 'active'
      };

      if (role) {
        roleQuery['code.coding.code'] = role;
      }

      // Get roles in this org
      const roles = await FhirPractitionerRole.find(roleQuery);
      const practitionerIds = roles.map(r => r.practitionerId);

      // Build query for practitioners
      const practitionerQuery = {
        id: { $in: practitionerIds }
      };

      if (status) {
        practitionerQuery.accountStatus = status;
      }

      if (search) {
        practitionerQuery.$or = [
          { 'name.family': { $regex: search, $options: 'i' } },
          { 'name.given': { $regex: search, $options: 'i' } },
          { 'telecom.value': { $regex: search, $options: 'i' } }
        ];
      }

      const practitioners = await FhirPractitioner.find(practitionerQuery)
        .sort({ 'name.family': 1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await FhirPractitioner.countDocuments(practitionerQuery);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: practitioners.map(p => {
          const roleInOrg = roles.find(r => r.practitionerId === p.id);
          return {
            resource: {
              resourceType: p.resourceType,
              id: p.id,
              email: p.email,
              firstName: p.firstName,
              lastName: p.lastName,
              fullName: p.fullName,
              photo: p.photo?.[0]?.url,
              accountStatus: p.accountStatus,
              role: roleInOrg?.roleCode,
              permissions: roleInOrg?.getAllPermissions() || [],
              lastLoginAt: p.lastLoginAt
            }
          };
        })
      });

    } catch (error) {
      console.error('List practitioners error:', error);
      res.status(500).json({
        error: 'Failed to list practitioners',
        code: 'LIST_ERROR'
      });
    }
  }

  /**
   * POST /admin/practitioners/invite
   * Invite a new practitioner to the organization
   */
  async invite(req, res) {
    try {
      const { practitioner: inviter, organizationId } = req;
      const { email, firstName, lastName, role = 'employee', permissions = [] } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email required',
          code: 'MISSING_EMAIL'
        });
      }

      if (!['super_admin', 'org_admin', 'employee'].includes(role)) {
        return res.status(400).json({
          error: 'Invalid role',
          code: 'INVALID_ROLE'
        });
      }

      // Only super_admin can create super_admin
      const inviterRoles = await FhirPractitionerRole.findByPractitioner(inviter.id);
      const inviterIsSuperAdmin = inviterRoles.some(r => r.roleCode === 'super_admin');

      if (role === 'super_admin' && !inviterIsSuperAdmin) {
        return res.status(403).json({
          error: 'Only super admins can create super admin roles',
          code: 'SUPER_ADMIN_REQUIRED'
        });
      }

      // Get organization
      const org = await FhirOrganization.findOne({ id: organizationId });
      if (!org) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'ORG_NOT_FOUND'
        });
      }

      // Check if practitioner already exists
      let practitioner = await FhirPractitioner.findByEmail(email);

      if (practitioner) {
        // Check if already has role in this org
        const existingRole = await FhirPractitionerRole.findRole(practitioner.id, organizationId);
        if (existingRole) {
          return res.status(409).json({
            error: 'Practitioner already has a role in this organization',
            code: 'ALREADY_IN_ORG'
          });
        }
      } else {
        // Create Cognito user
        let cognitoUser;
        try {
          cognitoUser = await cognitoService.createUser({
            email,
            firstName: firstName || 'New',
            lastName: lastName || 'User'
          });
        } catch (cognitoError) {
          if (cognitoError.name === 'UsernameExistsException') {
            // User exists in Cognito but not in our DB - get their info
            cognitoUser = await cognitoService.getUser(email);
          } else {
            throw cognitoError;
          }
        }

        // Create practitioner record
        practitioner = new FhirPractitioner({
          cognitoSub: cognitoUser.sub,
          cognitoUsername: cognitoUser.username || email,
          name: [{
            use: 'official',
            family: lastName || '',
            given: firstName ? [firstName] : []
          }],
          telecom: [
            { system: 'email', value: email.toLowerCase(), use: 'work' }
          ],
          active: true,
          accountStatus: 'pending_verification'
        });

        await practitioner.save();
      }

      // Create role in organization
      const practitionerRole = new FhirPractitionerRole({
        practitioner: {
          reference: `Practitioner/${practitioner.id}`,
          display: practitioner.fullName || email
        },
        organization: {
          reference: `Organization/${organizationId}`,
          display: org.name
        },
        code: [{
          coding: [{
            system: 'http://brigid.com/fhir/CodeSystem/admin-role',
            code: role
          }]
        }],
        extension: permissions.map(p => ({
          url: 'http://brigid.com/fhir/StructureDefinition/permissions',
          valueCode: p
        })),
        invitedBy: {
          reference: `Practitioner/${inviter.id}`,
          display: inviter.fullName || inviter.email
        },
        active: true,
        roleStatus: 'pending'
      });

      await practitionerRole.save();

      console.log(`📧 Practitioner invited: ${email} as ${role} to ${org.name}`);

      res.status(201).json({
        success: true,
        practitioner: {
          id: practitioner.id,
          email: practitioner.email,
          fullName: practitioner.fullName,
          accountStatus: practitioner.accountStatus
        },
        role: {
          id: practitionerRole.id,
          role: practitionerRole.roleCode,
          organization: org.name
        }
      });

    } catch (error) {
      console.error('Invite practitioner error:', error);
      res.status(500).json({
        error: 'Failed to invite practitioner',
        code: 'INVITE_ERROR'
      });
    }
  }

  /**
   * GET /admin/practitioners/:id
   * Get practitioner details
   */
  async get(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;

      const practitioner = await FhirPractitioner.findOne({ id });

      if (!practitioner) {
        return res.status(404).json({
          error: 'Practitioner not found',
          code: 'NOT_FOUND'
        });
      }

      // Get role in current org
      const roleInOrg = await FhirPractitionerRole.findRole(practitioner.id, organizationId);

      if (!roleInOrg) {
        return res.status(403).json({
          error: 'Practitioner not in this organization',
          code: 'NOT_IN_ORG'
        });
      }

      res.json({
        resourceType: practitioner.resourceType,
        id: practitioner.id,
        identifier: practitioner.identifier,
        email: practitioner.email,
        firstName: practitioner.firstName,
        lastName: practitioner.lastName,
        fullName: practitioner.fullName,
        phone: practitioner.getPhone(),
        photo: practitioner.photo?.[0]?.url,
        accountStatus: practitioner.accountStatus,
        role: {
          id: roleInOrg.id,
          code: roleInOrg.roleCode,
          permissions: roleInOrg.getAllPermissions(),
          status: roleInOrg.roleStatus,
          joinedAt: roleInOrg.joinedAt
        },
        lastLoginAt: practitioner.lastLoginAt,
        createdAt: practitioner.createdAt
      });

    } catch (error) {
      console.error('Get practitioner error:', error);
      res.status(500).json({
        error: 'Failed to get practitioner',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * PUT /admin/practitioners/:id/role
   * Update practitioner's role in the organization
   */
  async updateRole(req, res) {
    try {
      const { practitioner: updater, organizationId } = req;
      const { id } = req.params;
      const { role, permissions, status } = req.body;

      // Get the role assignment
      const roleAssignment = await FhirPractitionerRole.findRole(id, organizationId);

      if (!roleAssignment) {
        return res.status(404).json({
          error: 'Role assignment not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Check if trying to modify super_admin
      if (roleAssignment.roleCode === 'super_admin' || role === 'super_admin') {
        const updaterRoles = await FhirPractitionerRole.findByPractitioner(updater.id);
        const updaterIsSuperAdmin = updaterRoles.some(r => r.roleCode === 'super_admin');

        if (!updaterIsSuperAdmin) {
          return res.status(403).json({
            error: 'Only super admins can modify super admin roles',
            code: 'SUPER_ADMIN_REQUIRED'
          });
        }
      }

      // Update role code
      if (role && ['super_admin', 'org_admin', 'employee'].includes(role)) {
        roleAssignment.code = [{
          coding: [{
            system: 'http://brigid.com/fhir/CodeSystem/admin-role',
            code: role
          }]
        }];
      }

      // Update permissions
      if (permissions !== undefined) {
        roleAssignment.extension = permissions.map(p => ({
          url: 'http://brigid.com/fhir/StructureDefinition/permissions',
          valueCode: p
        }));
      }

      // Update status
      if (status && ['active', 'suspended', 'pending', 'revoked'].includes(status)) {
        roleAssignment.roleStatus = status;
        if (status === 'revoked') {
          roleAssignment.active = false;
        }
      }

      await roleAssignment.save();

      console.log(`📝 Practitioner role updated: ${id} in org ${organizationId}`);

      res.json({
        success: true,
        role: {
          id: roleAssignment.id,
          code: roleAssignment.roleCode,
          permissions: roleAssignment.getAllPermissions(),
          status: roleAssignment.roleStatus
        }
      });

    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({
        error: 'Failed to update role',
        code: 'UPDATE_ROLE_ERROR'
      });
    }
  }

  /**
   * DELETE /admin/practitioners/:id
   * Remove practitioner from organization
   */
  async remove(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const { deleteUser = false } = req.query;

      // Get the role assignment
      const roleAssignment = await FhirPractitionerRole.findRole(id, organizationId);

      if (!roleAssignment) {
        return res.status(404).json({
          error: 'Practitioner not in this organization',
          code: 'NOT_IN_ORG'
        });
      }

      // Revoke the role
      roleAssignment.active = false;
      roleAssignment.roleStatus = 'revoked';
      roleAssignment.period.end = new Date();
      await roleAssignment.save();

      // Optionally delete the practitioner entirely
      if (deleteUser === 'true') {
        const practitioner = await FhirPractitioner.findOne({ id });

        if (practitioner) {
          // Check if they have roles in other orgs
          const otherRoles = await FhirPractitionerRole.find({
            'practitioner.reference': `Practitioner/${id}`,
            'organization.reference': { $ne: `Organization/${organizationId}` },
            active: true
          });

          if (otherRoles.length === 0) {
            // No other roles - deactivate the practitioner
            practitioner.accountStatus = 'deactivated';
            practitioner.active = false;
            await practitioner.save();

            // Disable in Cognito
            if (practitioner.email) {
              try {
                await cognitoService.disableUser(practitioner.email);
              } catch (cognitoError) {
                console.warn('Failed to disable Cognito user:', cognitoError.message);
              }
            }
          }
        }
      }

      console.log(`🗑️ Practitioner removed from org: ${id} from ${organizationId}`);

      res.json({
        success: true,
        message: 'Practitioner removed from organization'
      });

    } catch (error) {
      console.error('Remove practitioner error:', error);
      res.status(500).json({
        error: 'Failed to remove practitioner',
        code: 'REMOVE_ERROR'
      });
    }
  }

  /**
   * POST /admin/practitioners/:id/status
   * Update practitioner status in organization
   */
  async updateStatus(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['active', 'suspended'].includes(status)) {
        return res.status(400).json({
          error: 'Valid status required (active or suspended)',
          code: 'INVALID_STATUS'
        });
      }

      // Get the role assignment
      const roleAssignment = await FhirPractitionerRole.findRole(id, organizationId);

      if (!roleAssignment) {
        return res.status(404).json({
          error: 'Practitioner not in this organization',
          code: 'NOT_IN_ORG'
        });
      }

      roleAssignment.roleStatus = status;
      await roleAssignment.save();

      console.log(`📝 Practitioner status updated: ${id} -> ${status}`);

      res.json({
        success: true,
        role: {
          id: roleAssignment.id,
          status: roleAssignment.roleStatus
        }
      });

    } catch (error) {
      console.error('Update practitioner status error:', error);
      res.status(500).json({
        error: 'Failed to update status',
        code: 'UPDATE_STATUS_ERROR'
      });
    }
  }
}

export default new AdminPractitionerController();
