/**
 * Role-Based Access Control (RBAC) Middleware
 * Works with FhirPractitionerRole for multi-tenant access control
 *
 * Roles:
 * - super_admin: Full access to all organizations
 * - org_admin: Full access within their organization
 * - employee: Limited access based on explicit permissions
 */
import FhirPractitionerRole from '../models/FhirPractitionerRole.js';

/**
 * Set organization context from header or practitioner's active org
 * Attaches:
 * - req.organizationId: Current organization ID
 * - req.practitionerRole: PractitionerRole for current org (if any)
 */
export const setOrgContext = async (req, res, next) => {
  try {
    const { practitioner } = req;

    if (!practitioner) {
      return next();
    }

    // Get org from header or practitioner's active org
    const orgIdFromHeader = req.headers['x-organization-id'];
    const orgId = orgIdFromHeader || practitioner.activeOrganizationId;

    if (!orgId) {
      // No org context, continue without it
      req.organizationId = null;
      req.practitionerRole = null;
      return next();
    }

    // Look up practitioner's role in this org
    const role = await FhirPractitionerRole.findRole(practitioner.id, orgId);

    if (role && role.active && role.roleStatus === 'active') {
      req.organizationId = orgId;
      req.practitionerRole = role;
    } else {
      // Check if super_admin (can access any org)
      const superAdminRoles = await FhirPractitionerRole.findByPractitioner(practitioner.id);
      const isSuperAdmin = superAdminRoles.some(r => r.roleCode === 'super_admin');

      if (isSuperAdmin) {
        req.organizationId = orgId;
        req.practitionerRole = superAdminRoles.find(r => r.roleCode === 'super_admin');
      } else {
        req.organizationId = null;
        req.practitionerRole = null;
      }
    }

    next();
  } catch (error) {
    console.error('Error setting org context:', error);
    next(error);
  }
};

/**
 * Require specific role(s) in the current organization
 * Must be used after setOrgContext
 *
 * @param {...string} allowedRoles - Roles that can access (e.g., 'super_admin', 'org_admin', 'employee')
 */
export const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const { practitioner, practitionerRole, organizationId } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      // If no org context set, try to set it now
      if (!organizationId && !practitionerRole) {
        await new Promise((resolve) => setOrgContext(req, res, resolve));
      }

      // Check if super_admin (has access to everything)
      if (req.practitionerRole?.isSuperAdmin?.()) {
        return next();
      }

      // Require org context for non-super-admin roles
      if (!req.organizationId) {
        return res.status(400).json({
          error: 'Organization context required. Set X-Organization-Id header.',
          code: 'NO_ORG_CONTEXT'
        });
      }

      if (!req.practitionerRole) {
        return res.status(403).json({
          error: 'No access to this organization',
          code: 'ORG_ACCESS_DENIED'
        });
      }

      const currentRole = req.practitionerRole.roleCode;

      if (!allowedRoles.includes(currentRole)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'ROLE_NOT_ALLOWED',
          required: allowedRoles,
          current: currentRole
        });
      }

      next();
    } catch (error) {
      console.error('RBAC error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Require super_admin role (global access)
 * Super admins can access all organizations
 */
export const requireSuperAdmin = async (req, res, next) => {
  try {
    const { practitioner } = req;

    if (!practitioner) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Check if practitioner has super_admin role in any org
    const roles = await FhirPractitionerRole.findByPractitioner(practitioner.id);
    const isSuperAdmin = roles.some(r => r.roleCode === 'super_admin');

    if (!isSuperAdmin) {
      return res.status(403).json({
        error: 'Super admin access required',
        code: 'SUPER_ADMIN_REQUIRED'
      });
    }

    // Attach super admin role to request
    req.practitionerRole = roles.find(r => r.roleCode === 'super_admin');

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

/**
 * Require specific permission in current organization
 * Permissions are checked against PractitionerRole extensions
 *
 * @param {string} permission - e.g., 'patients:read', 'devices:write'
 */
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { practitioner, practitionerRole, organizationId } = req;

      if (!practitioner) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      // If no org context set, try to set it now
      if (!organizationId && !practitionerRole) {
        await new Promise((resolve) => setOrgContext(req, res, resolve));
      }

      // Super admins and org admins have all permissions
      if (req.practitionerRole?.isSuperAdmin?.() || req.practitionerRole?.isOrgAdmin?.()) {
        return next();
      }

      // Require org context
      if (!req.organizationId) {
        return res.status(400).json({
          error: 'Organization context required. Set X-Organization-Id header.',
          code: 'NO_ORG_CONTEXT'
        });
      }

      if (!req.practitionerRole) {
        return res.status(403).json({
          error: 'No access to this organization',
          code: 'ORG_ACCESS_DENIED'
        });
      }

      // Check specific permission for employees
      if (!req.practitionerRole.hasPermission(permission)) {
        return res.status(403).json({
          error: 'Permission denied',
          code: 'PERMISSION_DENIED',
          required: permission
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Get all organizations the practitioner has access to
 * For super_admin, returns null (meaning all orgs)
 * For others, returns array of organization IDs
 */
export const getAccessibleOrganizations = async (practitionerId) => {
  const roles = await FhirPractitionerRole.findByPractitioner(practitionerId);

  // Check if super admin
  const isSuperAdmin = roles.some(r => r.roleCode === 'super_admin');
  if (isSuperAdmin) {
    return null; // null = all organizations
  }

  // Return list of org IDs
  return roles.map(r => r.organizationId);
};

/**
 * Check if practitioner is super admin
 */
export const isSuperAdmin = async (practitionerId) => {
  const roles = await FhirPractitionerRole.findByPractitioner(practitionerId);
  return roles.some(r => r.roleCode === 'super_admin');
};

export default {
  setOrgContext,
  requireRole,
  requireSuperAdmin,
  requirePermission,
  getAccessibleOrganizations,
  isSuperAdmin
};
