/**
 * Admin Patient Routes
 * Patient (customer) management for the admin portal
 */
import express from 'express';
import adminPatientController from '../controllers/admin-patient-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requirePermission } from '../middleware/rbac.js';

class AdminPatientRoutes {
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
     * Patient CRUD
     */

    // GET /admin/patients - List patients
    this.router.get('/', requirePermission('patients:read'), adminPatientController.list);

    // POST /admin/patients - Create patient
    this.router.post('/', requirePermission('patients:write'), adminPatientController.create);

    // GET /admin/patients/:id - Get patient details
    this.router.get('/:id', requirePermission('patients:read'), adminPatientController.get);

    // PUT /admin/patients/:id - Update patient
    this.router.put('/:id', requirePermission('patients:write'), adminPatientController.update);

    // DELETE /admin/patients/:id - Delete patient
    this.router.delete('/:id', requirePermission('patients:delete'), adminPatientController.delete);

    /**
     * Patient-Device Assignment
     */

    // POST /admin/patients/:id/devices - Assign device to patient
    this.router.post('/:id/devices', requirePermission('devices:write'), adminPatientController.assignDevice);

    // DELETE /admin/patients/:id/devices/:deviceId - Remove device from patient
    this.router.delete('/:id/devices/:deviceId', requirePermission('devices:write'), adminPatientController.removeDevice);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminPatientRoutes().getRouter();
