/**
 * Admin Organization Controller
 * Handles organization CRUD operations for the admin portal
 */
import FhirOrganization from '../models/FhirOrganization.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';

class AdminOrganizationController {

  /**
   * GET /admin/organizations
   * List organizations (super_admin: all, others: their orgs)
   */
  async list(req, res) {
    try {
      const { practitioner, practitionerRole } = req;
      const { search, status, limit = 50, offset = 0 } = req.query;

      // Check if super admin
      const roles = await FhirPractitionerRole.findByPractitioner(practitioner.id);
      const isSuperAdmin = roles.some(r => r.roleCode === 'super_admin');

      let query = {};

      if (!isSuperAdmin) {
        // Non-super-admins can only see their organizations
        const orgIds = roles.map(r => r.organizationId).filter(Boolean);
        query.id = { $in: orgIds };
      }

      if (status) {
        query.active = status === 'active';
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'alias': { $regex: search, $options: 'i' } }
        ];
      }

      const organizations = await FhirOrganization.find(query)
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await FhirOrganization.countDocuments(query);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: organizations.map(org => ({
          resource: {
            resourceType: org.resourceType,
            id: org.id,
            name: org.name,
            slug: org.slug,
            active: org.active,
            telecom: org.telecom,
            address: org.address,
            settings: org.getSettings(),
            createdAt: org.createdAt
          }
        }))
      });

    } catch (error) {
      console.error('List organizations error:', error);
      res.status(500).json({
        error: 'Failed to list organizations',
        code: 'LIST_ERROR'
      });
    }
  }

  /**
   * POST /admin/organizations
   * Create a new organization (super_admin only)
   */
  async create(req, res) {
    try {
      const { practitioner } = req;
      const {
        name,
        slug,
        contactEmail,
        contactPhone,
        address,
        settings
      } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Organization name required',
          code: 'MISSING_NAME'
        });
      }

      // Check if slug is already taken
      if (slug) {
        const existing = await FhirOrganization.findBySlug(slug);
        if (existing) {
          return res.status(409).json({
            error: 'Slug already in use',
            code: 'SLUG_EXISTS'
          });
        }
      }

      // Create organization
      const organization = new FhirOrganization({
        name,
        identifier: slug ? [{ system: 'urn:brigid:org:slug', value: slug }] : [],
        telecom: [
          ...(contactEmail ? [{ system: 'email', value: contactEmail, use: 'work' }] : []),
          ...(contactPhone ? [{ system: 'phone', value: contactPhone, use: 'work' }] : [])
        ],
        address: address ? [address] : [],
        extension: settings ? [{
          url: 'http://brigid.com/fhir/StructureDefinition/org-settings',
          valueString: JSON.stringify(settings)
        }] : [],
        createdBy: practitioner.id,
        active: true
      });

      await organization.save();

      console.log(`✅ Organization created: ${name} by ${practitioner.email}`);

      res.status(201).json({
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          active: organization.active
        }
      });

    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({
        error: 'Failed to create organization',
        code: 'CREATE_ERROR'
      });
    }
  }

  /**
   * GET /admin/organizations/:id
   * Get organization details
   */
  async get(req, res) {
    try {
      const { id } = req.params;

      const organization = await FhirOrganization.findOne({ id });

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND'
        });
      }

      // Get practitioner count in this org
      const practitionerCount = await FhirPractitionerRole.countDocuments({
        'organization.reference': `Organization/${id}`,
        active: true
      });

      res.json({
        resourceType: organization.resourceType,
        id: organization.id,
        identifier: organization.identifier,
        name: organization.name,
        slug: organization.slug,
        alias: organization.alias,
        active: organization.active,
        telecom: organization.telecom,
        address: organization.address,
        contact: organization.contact,
        settings: organization.getSettings(),
        practitionerCount,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt
      });

    } catch (error) {
      console.error('Get organization error:', error);
      res.status(500).json({
        error: 'Failed to get organization',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * PUT /admin/organizations/:id
   * Update organization (super_admin or org_admin)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        alias,
        contactEmail,
        contactPhone,
        address,
        settings
      } = req.body;

      const organization = await FhirOrganization.findOne({ id });

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND'
        });
      }

      // Update fields
      if (name) organization.name = name;
      if (alias) organization.alias = alias;

      // Update telecom
      if (contactEmail !== undefined || contactPhone !== undefined) {
        const telecom = [];
        if (contactEmail) telecom.push({ system: 'email', value: contactEmail, use: 'work' });
        if (contactPhone) telecom.push({ system: 'phone', value: contactPhone, use: 'work' });
        organization.telecom = telecom;
      }

      // Update address
      if (address !== undefined) {
        organization.address = address ? [address] : [];
      }

      // Update settings
      if (settings !== undefined) {
        const settingsExt = organization.extension?.find(
          e => e.url === 'http://brigid.com/fhir/StructureDefinition/org-settings'
        );
        if (settingsExt) {
          settingsExt.valueString = JSON.stringify(settings);
        } else {
          if (!organization.extension) organization.extension = [];
          organization.extension.push({
            url: 'http://brigid.com/fhir/StructureDefinition/org-settings',
            valueString: JSON.stringify(settings)
          });
        }
      }

      await organization.save();

      console.log(`📝 Organization updated: ${organization.name}`);

      res.json({
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          active: organization.active
        }
      });

    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({
        error: 'Failed to update organization',
        code: 'UPDATE_ERROR'
      });
    }
  }

  /**
   * DELETE /admin/organizations/:id
   * Delete organization (super_admin only)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;

      const organization = await FhirOrganization.findOne({ id });

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND'
        });
      }

      // Check if there are any active practitioners in this org
      const practitionerCount = await FhirPractitionerRole.countDocuments({
        'organization.reference': `Organization/${id}`,
        active: true
      });

      if (practitionerCount > 0) {
        return res.status(400).json({
          error: `Cannot delete organization with ${practitionerCount} active practitioners`,
          code: 'HAS_PRACTITIONERS'
        });
      }

      // Soft delete - set to inactive
      organization.active = false;
      await organization.save();

      console.log(`🗑️ Organization deleted: ${organization.name}`);

      res.json({
        success: true,
        message: 'Organization deleted'
      });

    } catch (error) {
      console.error('Delete organization error:', error);
      res.status(500).json({
        error: 'Failed to delete organization',
        code: 'DELETE_ERROR'
      });
    }
  }

  /**
   * POST /admin/organizations/:id/status
   * Update organization status (super_admin only)
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { active } = req.body;

      if (active === undefined) {
        return res.status(400).json({
          error: 'Active status required',
          code: 'MISSING_STATUS'
        });
      }

      const organization = await FhirOrganization.findOne({ id });

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND'
        });
      }

      organization.active = active;
      await organization.save();

      console.log(`📝 Organization ${active ? 'activated' : 'suspended'}: ${organization.name}`);

      res.json({
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          active: organization.active
        }
      });

    } catch (error) {
      console.error('Update organization status error:', error);
      res.status(500).json({
        error: 'Failed to update organization status',
        code: 'UPDATE_STATUS_ERROR'
      });
    }
  }
}

export default new AdminOrganizationController();
