/**
 * Telecare Device Routes
 * BS 8521-2 compliant telecare device and alarm management
 */
import express from 'express';
import telecareController from '../controllers/telecare-controller.js';
import escalationConfig from '../config/telecare-escalation.js';
import telecareEscalation from '../services/telecare-escalation-service.js';
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

        /**
         * Escalation Configuration
         */

        // GET /telecare/admin/escalation-config - Get escalation config
        this.router.get('/admin/escalation-config',
            requireRole('org_admin', 'super_admin'),
            async (req, res) => {
                try {
                    const { organizationId } = req;
                    const config = await escalationConfig.getConfig(organizationId);
                    res.json(config);
                } catch (error) {
                    console.error('Error getting escalation config:', error);
                    res.status(500).json({ error: 'Failed to get escalation config' });
                }
            }
        );

        // PUT /telecare/admin/escalation-config - Update escalation config
        this.router.put('/admin/escalation-config',
            requireRole('org_admin', 'super_admin'),
            async (req, res) => {
                try {
                    const { organizationId } = req;
                    const {
                        firstEscalationSeconds,
                        secondEscalationSeconds,
                        maxRetries,
                        supervisorEmail,
                        supervisorPhone,
                        enabled
                    } = req.body;

                    const config = await escalationConfig.updateConfig(organizationId, {
                        firstEscalationSeconds,
                        secondEscalationSeconds,
                        maxRetries,
                        supervisorEmail,
                        supervisorPhone,
                        enabled
                    });

                    res.json({
                        message: 'Escalation config updated',
                        config
                    });
                } catch (error) {
                    console.error('Error updating escalation config:', error);
                    res.status(500).json({ error: 'Failed to update escalation config' });
                }
            }
        );

        // GET /telecare/admin/escalation-config/all - List all configs (super_admin only)
        this.router.get('/admin/escalation-config/all',
            requireRole('super_admin'),
            async (req, res) => {
                try {
                    const configs = await escalationConfig.listConfigs();
                    res.json(configs);
                } catch (error) {
                    console.error('Error listing escalation configs:', error);
                    res.status(500).json({ error: 'Failed to list escalation configs' });
                }
            }
        );

        // GET /telecare/admin/escalation-status - Get pending escalations count
        this.router.get('/admin/escalation-status',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const pendingCount = await telecareEscalation.getPendingEscalationsCount();
                    res.json({
                        pendingEscalations: pendingCount
                    });
                } catch (error) {
                    console.error('Error getting escalation status:', error);
                    res.status(500).json({ error: 'Failed to get escalation status' });
                }
            }
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
