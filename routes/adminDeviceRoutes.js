/**
 * Admin Device Routes
 * Device management for the admin portal
 */
import express from 'express';
import adminDeviceController from '../controllers/admin-device-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole, requirePermission } from '../middleware/rbac.js';

class AdminDeviceRoutes {
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
     * Device List & Details
     */

    // GET /admin/devices - List devices in org
    this.router.get('/', requirePermission('devices:read'), adminDeviceController.list);

    // GET /admin/devices/:id - Get device details
    this.router.get('/:id', requirePermission('devices:read'), adminDeviceController.get);

    /**
     * Device Management
     */

    // PUT /admin/devices/:id - Update device
    this.router.put('/:id', requirePermission('devices:write'), adminDeviceController.update);

    // POST /admin/devices/:id/revoke - Revoke device
    this.router.post('/:id/revoke', requirePermission('devices:delete'), adminDeviceController.revoke);

    // POST /admin/devices/:id/reactivate - Reactivate device
    this.router.post('/:id/reactivate', requirePermission('devices:write'), adminDeviceController.reactivate);

    /**
     * Device Assignment
     */

    // POST /admin/devices/:id/assign - Assign device to org
    this.router.post('/:id/assign', requireRole('super_admin', 'org_admin'), adminDeviceController.assignToOrg);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminDeviceRoutes().getRouter();
