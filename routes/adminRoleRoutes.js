/**
 * Admin Role Routes
 * Role template management for the admin portal
 */
import express from 'express';
import adminRoleController from '../controllers/admin-role-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole } from '../middleware/rbac.js';

class AdminRoleRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // All routes require authentication and org context
    this.router.use(verifyCognitoToken, requirePractitioner, setOrgContext);

    // GET /admin/roles/permissions - Get available permissions (any authenticated user)
    this.router.get('/permissions', adminRoleController.getPermissions);

    // GET /admin/roles - List roles (org_admin or super_admin)
    this.router.get('/', requireRole('org_admin', 'super_admin'), adminRoleController.list);

    // POST /admin/roles - Create role (org_admin or super_admin)
    this.router.post('/', requireRole('org_admin', 'super_admin'), adminRoleController.create);

    // GET /admin/roles/:id - Get role (org_admin or super_admin)
    this.router.get('/:id', requireRole('org_admin', 'super_admin'), adminRoleController.get);

    // PUT /admin/roles/:id - Update role (org_admin or super_admin)
    this.router.put('/:id', requireRole('org_admin', 'super_admin'), adminRoleController.update);

    // DELETE /admin/roles/:id - Delete role (org_admin or super_admin)
    this.router.delete('/:id', requireRole('org_admin', 'super_admin'), adminRoleController.delete);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminRoleRoutes().getRouter();
