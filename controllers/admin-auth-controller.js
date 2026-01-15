/**
 * Admin Auth Controller
 * Handles authentication and profile management for the admin portal
 */
import FhirPractitioner from '../models/FhirPractitioner.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';
import FhirOrganization from '../models/FhirOrganization.js';
import cognitoService from '../services/cognito-service.js';

class AdminAuthController {

  /**
   * POST /admin/auth/register
   * Register a new practitioner after Cognito signup
   * Called after user completes Cognito registration
   */
  async register(req, res) {
    try {
      const { cognitoUser } = req;

      if (!cognitoUser) {
        return res.status(401).json({
          error: 'Cognito authentication required',
          code: 'NO_COGNITO_USER'
        });
      }

      // Check if practitioner already exists
      let practitioner = await FhirPractitioner.findByCognitoSub(cognitoUser.sub);

      if (practitioner) {
        // If practitioner exists with pending_verification, activate them
        // (they've now completed Cognito password setup)
        if (practitioner.accountStatus === 'pending_verification') {
          practitioner.accountStatus = 'active';
          practitioner.lastLoginAt = new Date();

          // Also activate any pending PractitionerRoles and set active org
          const pendingRoles = await FhirPractitionerRole.find({
            'practitioner.reference': `Practitioner/${practitioner.id}`,
            active: true,
            roleStatus: 'pending'
          });

          for (const role of pendingRoles) {
            role.roleStatus = 'active';
            role.joinedAt = new Date();
            await role.save();
            console.log(`✅ Role activated: ${role.roleCode} in org ${role.organizationId}`);

            // Set first org as active organization if not already set
            if (!practitioner.activeOrganizationId && role.organizationId) {
              practitioner.activeOrganizationId = role.organizationId;
            }
          }

          await practitioner.save();
          console.log(`✅ Practitioner activated: ${cognitoUser.email}`);
        }

        return res.status(409).json({
          error: 'User already registered',
          code: 'ALREADY_REGISTERED',
          practitionerId: practitioner.id
        });
      }

      const { firstName, lastName, phone } = req.body;

      // Create practitioner record
      practitioner = new FhirPractitioner({
        cognitoSub: cognitoUser.sub,
        cognitoUsername: cognitoUser.username,
        name: [{
          use: 'official',
          family: lastName || '',
          given: firstName ? [firstName] : []
        }],
        telecom: [
          { system: 'email', value: cognitoUser.email, use: 'work' },
          ...(phone ? [{ system: 'phone', value: phone, use: 'work' }] : [])
        ],
        active: true,
        accountStatus: 'active',
        lastLoginAt: new Date()
      });

      await practitioner.save();

      // Check if this is the first practitioner - make them super admin
      const practitionerCount = await FhirPractitioner.countDocuments();
      let isSuperAdmin = false;

      if (practitionerCount === 1) {
        // First user becomes super admin
        const superAdminRole = new FhirPractitionerRole({
          practitioner: { reference: `Practitioner/${practitioner.id}` },
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
        isSuperAdmin = true;
        console.log(`👑 First user - granted super admin: ${cognitoUser.email}`);
      }

      console.log(`✅ New practitioner registered: ${cognitoUser.email}`);

      res.status(201).json({
        success: true,
        practitioner: {
          id: practitioner.id,
          email: practitioner.email,
          fullName: practitioner.fullName,
          accountStatus: practitioner.accountStatus,
          isSuperAdmin
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }

  /**
   * GET /admin/auth/me
   * Get current practitioner profile with roles
   */
  async getMe(req, res) {
    try {
      const { practitioner } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'User not registered',
          code: 'NOT_REGISTERED'
        });
      }

      // Get all roles for this practitioner
      const roles = await FhirPractitionerRole.findByPractitioner(practitioner.id);

      // Get organization details for each role
      const rolesWithOrgs = await Promise.all(
        roles.map(async (role) => {
          const orgId = role.organizationId;
          const org = orgId ? await FhirOrganization.findOne({ id: orgId }) : null;

          return {
            id: role.id,
            role: role.roleCode,
            permissions: role.getAllPermissions(),
            organization: org ? {
              id: org.id,
              name: org.name,
              slug: org.slug
            } : null,
            joinedAt: role.joinedAt
          };
        })
      );

      // Get current organization if set
      let currentOrg = null;
      if (practitioner.activeOrganizationId) {
        currentOrg = await FhirOrganization.findOne({ id: practitioner.activeOrganizationId });
      }

      res.json({
        id: practitioner.id,
        email: practitioner.email,
        firstName: practitioner.firstName,
        lastName: practitioner.lastName,
        fullName: practitioner.fullName,
        phone: practitioner.getPhone(),
        photo: practitioner.photo?.[0]?.url,
        accountStatus: practitioner.accountStatus,
        activeOrganization: currentOrg ? {
          id: currentOrg.id,
          name: currentOrg.name,
          slug: currentOrg.slug
        } : null,
        roles: rolesWithOrgs,
        isSuperAdmin: roles.some(r => r.roleCode === 'super_admin'),
        lastLoginAt: practitioner.lastLoginAt
      });

    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        error: 'Failed to get profile',
        code: 'GET_PROFILE_ERROR'
      });
    }
  }

  /**
   * PUT /admin/auth/me
   * Update current practitioner profile
   */
  async updateProfile(req, res) {
    try {
      const { practitioner } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'User not registered',
          code: 'NOT_REGISTERED'
        });
      }

      const { firstName, lastName, phone, photo } = req.body;

      // Update name
      if (firstName || lastName) {
        const officialName = practitioner.name?.find(n => n.use === 'official') || {};
        practitioner.name = [{
          use: 'official',
          family: lastName || officialName.family || '',
          given: firstName ? [firstName] : (officialName.given || [])
        }];
      }

      // Update phone
      if (phone !== undefined) {
        const otherTelecom = practitioner.telecom?.filter(t => t.system !== 'phone') || [];
        practitioner.telecom = [
          ...otherTelecom,
          ...(phone ? [{ system: 'phone', value: phone, use: 'work' }] : [])
        ];
      }

      // Update photo
      if (photo !== undefined) {
        practitioner.photo = photo ? [{ url: photo }] : [];
      }

      await practitioner.save();

      // Also update Cognito attributes
      try {
        const updates = {};
        if (firstName) updates.firstName = firstName;
        if (lastName) updates.lastName = lastName;
        if (phone !== undefined) updates.phone = phone || '';

        if (Object.keys(updates).length > 0) {
          await cognitoService.updateUserAttributes(practitioner.email, updates);
        }
      } catch (cognitoError) {
        console.warn('Failed to update Cognito attributes:', cognitoError.message);
        // Continue anyway - local update succeeded
      }

      res.json({
        success: true,
        practitioner: {
          id: practitioner.id,
          email: practitioner.email,
          firstName: practitioner.firstName,
          lastName: practitioner.lastName,
          fullName: practitioner.fullName,
          phone: practitioner.getPhone(),
          photo: practitioner.photo?.[0]?.url
        }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        error: 'Failed to update profile',
        code: 'UPDATE_PROFILE_ERROR'
      });
    }
  }

  /**
   * POST /admin/auth/switch-org
   * Switch active organization
   */
  async switchOrganization(req, res) {
    try {
      const { practitioner } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'User not registered',
          code: 'NOT_REGISTERED'
        });
      }

      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          error: 'Organization ID required',
          code: 'MISSING_ORG_ID'
        });
      }

      // Verify organization exists
      const org = await FhirOrganization.findOne({ id: organizationId, active: true });
      if (!org) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'ORG_NOT_FOUND'
        });
      }

      // Verify practitioner has access to this org
      const roles = await FhirPractitionerRole.findByPractitioner(practitioner.id);
      const isSuperAdmin = roles.some(r => r.roleCode === 'super_admin');
      const hasAccess = isSuperAdmin || roles.some(r => r.organizationId === organizationId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'No access to this organization',
          code: 'ORG_ACCESS_DENIED'
        });
      }

      // Update active organization
      practitioner.activeOrganizationId = organizationId;
      await practitioner.save();

      // Get role in this org
      const roleInOrg = roles.find(r => r.organizationId === organizationId);

      res.json({
        success: true,
        activeOrganization: {
          id: org.id,
          name: org.name,
          slug: org.slug
        },
        role: roleInOrg?.roleCode || (isSuperAdmin ? 'super_admin' : null),
        permissions: roleInOrg?.getAllPermissions() || (isSuperAdmin ? FhirPractitionerRole.schema.path('extension').options.type[0].options.enum : [])
      });

    } catch (error) {
      console.error('Switch org error:', error);
      res.status(500).json({
        error: 'Failed to switch organization',
        code: 'SWITCH_ORG_ERROR'
      });
    }
  }

  /**
   * GET /admin/auth/my-organizations
   * Get all organizations the practitioner has access to
   */
  async getMyOrganizations(req, res) {
    try {
      const { practitioner } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'User not registered',
          code: 'NOT_REGISTERED'
        });
      }

      // Get all roles
      const roles = await FhirPractitionerRole.findByPractitioner(practitioner.id);
      const isSuperAdmin = roles.some(r => r.roleCode === 'super_admin');

      let organizations;

      if (isSuperAdmin) {
        // Super admins see all organizations
        organizations = await FhirOrganization.findActive();
      } else {
        // Get organizations from roles
        const orgIds = [...new Set(roles.map(r => r.organizationId).filter(Boolean))];
        organizations = await FhirOrganization.find({
          id: { $in: orgIds },
          active: true
        }).sort({ name: 1 });
      }

      res.json({
        total: organizations.length,
        organizations: organizations.map(org => {
          const roleInOrg = roles.find(r => r.organizationId === org.id);
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: roleInOrg?.roleCode || (isSuperAdmin ? 'super_admin' : null),
            isActive: org.id === practitioner.activeOrganizationId
          };
        }),
        isSuperAdmin
      });

    } catch (error) {
      console.error('Get my organizations error:', error);
      res.status(500).json({
        error: 'Failed to get organizations',
        code: 'GET_ORGS_ERROR'
      });
    }
  }
}

export default new AdminAuthController();
