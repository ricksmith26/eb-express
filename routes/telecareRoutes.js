/**
 * Telecare Device Routes
 * BS 8521-2 compliant telecare device and alarm management
 */
import express from 'express';
import telecareController from '../controllers/telecare-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole, requirePermission } from '../middleware/rbac.js';
import { verifyAccessToken } from '../middleware/auth.js';

class TelecareRoutes {
    constructor() {
        this.router = express.Router();
        this.initializeRoutes();
    }

    initializeRoutes() {
        // ==========================================
        // Admin Routes (Cognito auth + RBAC)
        // ==========================================

        // All admin routes require Cognito authentication and org context
        this.router.use('/admin', verifyCognitoToken);
        this.router.use('/admin', requirePractitioner);
        this.router.use('/admin', setOrgContext);

        /**
         * Device Management
         */

        // GET /telecare/admin/devices - List telecare devices
        this.router.get('/admin/devices',
            requirePermission('devices:read'),
            telecareController.listDevices.bind(telecareController)
        );

        // GET /telecare/admin/devices/:deviceId - Get device details
        this.router.get('/admin/devices/:deviceId',
            requirePermission('devices:read'),
            telecareController.getDevice.bind(telecareController)
        );

        // POST /telecare/admin/devices - Create new device
        this.router.post('/admin/devices',
            requirePermission('devices:write'),
            telecareController.createDevice.bind(telecareController)
        );

        // PUT /telecare/admin/devices/:deviceId - Update device
        this.router.put('/admin/devices/:deviceId',
            requirePermission('devices:write'),
            telecareController.updateDevice.bind(telecareController)
        );

        // POST /telecare/admin/devices/:deviceId/deactivate - Deactivate device
        this.router.post('/admin/devices/:deviceId/deactivate',
            requirePermission('devices:delete'),
            telecareController.deactivateDevice.bind(telecareController)
        );

        // DELETE /telecare/admin/devices/:deviceId - Delete device completely
        this.router.delete('/admin/devices/:deviceId',
            requireRole('super_admin'),
            telecareController.deleteDevice.bind(telecareController)
        );

        // POST /telecare/admin/devices/:deviceId/link - Link device to patient
        this.router.post('/admin/devices/:deviceId/link',
            requirePermission('devices:write'),
            telecareController.linkToPatient.bind(telecareController)
        );

        // GET /telecare/admin/devices/:deviceId/credentials - Get SIP credentials
        this.router.get('/admin/devices/:deviceId/credentials',
            requireRole('org_admin', 'super_admin'),
            telecareController.getCredentials.bind(telecareController)
        );

        // POST /telecare/admin/devices/:deviceId/regenerate-password - Regenerate SIP password
        this.router.post('/admin/devices/:deviceId/regenerate-password',
            requireRole('org_admin', 'super_admin'),
            telecareController.regeneratePassword.bind(telecareController)
        );

        /**
         * Alarm Management
         */

        // GET /telecare/admin/alarms - List alarms
        this.router.get('/admin/alarms',
            requirePermission('devices:read'),
            telecareController.listAlarms.bind(telecareController)
        );

        // GET /telecare/admin/alarms/:alarmId - Get alarm details
        this.router.get('/admin/alarms/:alarmId',
            requirePermission('devices:read'),
            telecareController.getAlarm.bind(telecareController)
        );

        // POST /telecare/admin/alarms/:alarmId/acknowledge - Acknowledge alarm
        this.router.post('/admin/alarms/:alarmId/acknowledge',
            requirePermission('devices:write'),
            telecareController.acknowledgeAlarm.bind(telecareController)
        );

        /**
         * Statistics
         */

        // GET /telecare/admin/stats - Get telecare statistics
        this.router.get('/admin/stats',
            requirePermission('devices:read'),
            telecareController.getStatistics.bind(telecareController)
        );

        // ==========================================
        // Agent/Internal Routes (JWT auth)
        // ==========================================

        // GET /telecare/alarms - List alarms (for agent dashboard)
        this.router.get('/alarms',
            verifyAccessToken,
            telecareController.listAlarms.bind(telecareController)
        );

        // GET /telecare/alarms/:alarmId - Get alarm details (for agent)
        this.router.get('/alarms/:alarmId',
            verifyAccessToken,
            telecareController.getAlarm.bind(telecareController)
        );

        // POST /telecare/alarms/:alarmId/acknowledge - Acknowledge alarm (for agent)
        this.router.post('/alarms/:alarmId/acknowledge',
            verifyAccessToken,
            telecareController.acknowledgeAlarm.bind(telecareController)
        );

        // GET /telecare/devices/:deviceId - Get device info (for agent during call)
        this.router.get('/devices/:deviceId',
            verifyAccessToken,
            telecareController.getDevice.bind(telecareController)
        );

        // GET /telecare/stats - Get statistics (for agent dashboard)
        this.router.get('/stats',
            verifyAccessToken,
            telecareController.getStatistics.bind(telecareController)
        );
    }

    getRouter() {
        return this.router;
    }
}

export default new TelecareRoutes().getRouter();
