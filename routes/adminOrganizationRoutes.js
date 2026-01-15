/**
 * Admin Organization Routes
 * Organization management for the admin portal
 */
import express from 'express';
import adminOrganizationController from '../controllers/admin-organization-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole, requireSuperAdmin } from '../middleware/rbac.js';

class AdminOrganizationRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // All routes require Cognito authentication
    this.router.use(verifyCognitoToken);
    this.router.use(requirePractitioner);

    /**
     * Organization CRUD
     */

    // GET /admin/organizations - List organizations
    this.router.get('/', setOrgContext, adminOrganizationController.list);

    // POST /admin/organizations - Create organization (super_admin only)
    this.router.post('/', requireSuperAdmin, adminOrganizationController.create);

    // GET /admin/organizations/:id - Get organization details
    this.router.get('/:id', setOrgContext, adminOrganizationController.get);

    // PUT /admin/organizations/:id - Update organization
    this.router.put('/:id', setOrgContext, requireRole('super_admin', 'org_admin'), adminOrganizationController.update);

    // DELETE /admin/organizations/:id - Delete organization (super_admin only)
    this.router.delete('/:id', requireSuperAdmin, adminOrganizationController.delete);

    /**
     * Organization Status
     */

    // POST /admin/organizations/:id/status - Update status (super_admin only)
    this.router.post('/:id/status', requireSuperAdmin, adminOrganizationController.updateStatus);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminOrganizationRoutes().getRouter();
