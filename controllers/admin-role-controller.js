/**
 * Admin Role Controller
 * Manages custom role templates for organizations
 */
import FhirRoleTemplate, { PERMISSION_CODES } from '../models/FhirRoleTemplate.js';
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';

class AdminRoleController {

  /**
   * GET /admin/roles
   * List role templates for the current organization
   */
  async list(req, res) {
    try {
      const { organizationId } = req;

      const roles = await FhirRoleTemplate.findByOrganization(organizationId);

      // Count practitioners using each role
      const rolesWithCounts = await Promise.all(
        roles.map(async (role) => {
          const count = await FhirPractitionerRole.countDocuments({
            'organization.reference': `Organization/${organizationId}`,
            'extension.valueString': role.id,
            active: true,
            roleStatus: 'active'
          });

          return {
            id: role.id,
            name: role.name,
            description: role.description,
            permissions: role.permissions,
            isBuiltIn: role.isBuiltIn,
            practitionerCount: count,
            createdAt: role.createdAt
          };
        })
      );

      res.json({
        total: rolesWithCounts.length,
        roles: rolesWithCounts,
        availablePermissions: PERMISSION_CODES
      });

    } catch (error) {
      console.error('List roles error:', error);
      res.status(500).json({
        error: 'Failed to list roles',
        code: 'LIST_ROLES_ERROR'
      });
    }
  }

  /**
   * GET /admin/roles/permissions
   * Get all available permissions
   */
  async getPermissions(req, res) {
    try {
      // Group permissions by category
      const grouped = {};
      for (const perm of PERMISSION_CODES) {
        const [category, action] = perm.split(':');
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push({
          code: perm,
          action,
          label: `${action.charAt(0).toUpperCase() + action.slice(1)} ${category}`
        });
      }

      res.json({
        permissions: PERMISSION_CODES,
        grouped
      });

    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({
        error: 'Failed to get permissions',
        code: 'GET_PERMISSIONS_ERROR'
      });
    }
  }

  /**
   * POST /admin/roles
   * Create a new role template
   */
  async create(req, res) {
    try {
      const { practitioner, organizationId } = req;
      const { name, description, permissions = [] } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({
          error: 'Role name is required',
          code: 'MISSING_NAME'
        });
      }

      // Validate permissions
      const validPermissions = permissions.filter(p => PERMISSION_CODES.includes(p));

      // Check for duplicate name
      const existing = await FhirRoleTemplate.findOne({
        organizationId,
        name: name.trim(),
        active: true
      });

      if (existing) {
        return res.status(409).json({
          error: 'A role with this name already exists',
          code: 'DUPLICATE_NAME'
        });
      }

      const role = new FhirRoleTemplate({
        organizationId,
        name: name.trim(),
        description: description?.trim(),
        permissions: validPermissions,
        createdBy: {
          reference: `Practitioner/${practitioner.id}`,
          display: practitioner.fullName || practitioner.email
        }
      });

      await role.save();

      console.log(`📋 Role created: ${role.name} in org ${organizationId}`);

      res.status(201).json({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isBuiltIn: role.isBuiltIn,
        createdAt: role.createdAt
      });

    } catch (error) {
      console.error('Create role error:', error);
      res.status(500).json({
        error: 'Failed to create role',
        code: 'CREATE_ROLE_ERROR'
      });
    }
  }

  /**
   * GET /admin/roles/:id
   * Get a specific role template
   */
  async get(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;

      const role = await FhirRoleTemplate.findOne({
        id,
        $or: [
          { organizationId },
          { organizationId: null }
        ],
        active: true
      });

      if (!role) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'NOT_FOUND'
        });
      }

      // Count practitioners using this role
      const practitionerCount = await FhirPractitionerRole.countDocuments({
        'organization.reference': `Organization/${organizationId}`,
        'extension.valueString': role.id,
        active: true,
        roleStatus: 'active'
      });

      res.json({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isBuiltIn: role.isBuiltIn,
        practitionerCount,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt
      });

    } catch (error) {
      console.error('Get role error:', error);
      res.status(500).json({
        error: 'Failed to get role',
        code: 'GET_ROLE_ERROR'
      });
    }
  }

  /**
   * PUT /admin/roles/:id
   * Update a role template
   */
  async update(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const { name, description, permissions } = req.body;

      const role = await FhirRoleTemplate.findOne({
        id,
        organizationId,
        active: true
      });

      if (!role) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'NOT_FOUND'
        });
      }

      if (role.isBuiltIn) {
        return res.status(403).json({
          error: 'Cannot modify built-in roles',
          code: 'BUILTIN_ROLE'
        });
      }

      // Check for duplicate name if changing
      if (name && name.trim() !== role.name) {
        const existing = await FhirRoleTemplate.findOne({
          organizationId,
          name: name.trim(),
          active: true,
          id: { $ne: id }
        });

        if (existing) {
          return res.status(409).json({
            error: 'A role with this name already exists',
            code: 'DUPLICATE_NAME'
          });
        }

        role.name = name.trim();
      }

      if (description !== undefined) {
        role.description = description?.trim() || '';
      }

      if (permissions !== undefined) {
        role.permissions = permissions.filter(p => PERMISSION_CODES.includes(p));
      }

      await role.save();

      console.log(`📋 Role updated: ${role.name}`);

      res.json({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isBuiltIn: role.isBuiltIn,
        updatedAt: role.updatedAt
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
   * DELETE /admin/roles/:id
   * Delete a role template
   */
  async delete(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;

      const role = await FhirRoleTemplate.findOne({
        id,
        organizationId,
        active: true
      });

      if (!role) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'NOT_FOUND'
        });
      }

      if (role.isBuiltIn) {
        return res.status(403).json({
          error: 'Cannot delete built-in roles',
          code: 'BUILTIN_ROLE'
        });
      }

      // Check if any practitioners are using this role
      const usageCount = await FhirPractitionerRole.countDocuments({
        'organization.reference': `Organization/${organizationId}`,
        'extension.valueString': role.id,
        active: true,
        roleStatus: 'active'
      });

      if (usageCount > 0) {
        return res.status(409).json({
          error: `Cannot delete role: ${usageCount} practitioner(s) are using it`,
          code: 'ROLE_IN_USE'
        });
      }

      // Soft delete
      role.active = false;
      await role.save();

      console.log(`🗑️ Role deleted: ${role.name}`);

      res.json({
        success: true,
        message: 'Role deleted'
      });

    } catch (error) {
      console.error('Delete role error:', error);
      res.status(500).json({
        error: 'Failed to delete role',
        code: 'DELETE_ROLE_ERROR'
      });
    }
  }
}

export default new AdminRoleController();
