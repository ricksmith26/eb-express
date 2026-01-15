/**
 * Admin Practitioner Routes
 * Practitioner (employee) management for the admin portal
 */
import express from 'express';
import adminPractitionerController from '../controllers/admin-practitioner-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole } from '../middleware/rbac.js';

class AdminPractitionerRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // All routes require Cognito authentication and org context
    this.router.use(verifyCognitoToken);
    this.router.use(requirePractitioner);
    this.router.use(setOrgContext);

    /**
     * Practitioner List & Invite
     */

    // GET /admin/practitioners - List practitioners in org
    this.router.get('/', requireRole('super_admin', 'org_admin', 'employee'), adminPractitionerController.list);

    // POST /admin/practitioners/invite - Invite new practitioner
    this.router.post('/invite', requireRole('super_admin', 'org_admin'), adminPractitionerController.invite);

    /**
     * Individual Practitioner Management
     */

    // GET /admin/practitioners/:id - Get practitioner details
    this.router.get('/:id', requireRole('super_admin', 'org_admin', 'employee'), adminPractitionerController.get);

    // PUT /admin/practitioners/:id/role - Update practitioner role
    this.router.put('/:id/role', requireRole('super_admin', 'org_admin'), adminPractitionerController.updateRole);

    // POST /admin/practitioners/:id/status - Update practitioner status
    this.router.post('/:id/status', requireRole('super_admin', 'org_admin'), adminPractitionerController.updateStatus);

    // DELETE /admin/practitioners/:id - Remove practitioner from org
    this.router.delete('/:id', requireRole('super_admin', 'org_admin'), adminPractitionerController.remove);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminPractitionerRoutes().getRouter();
