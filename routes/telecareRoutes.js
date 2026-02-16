/**
 * Telecare Device Routes
 * BS 8521-2 compliant telecare device and alarm management
 */
import express from 'express';
import telecareController from '../controllers/telecare-controller.js';
import escalationConfig from '../config/telecare-escalation.js';
import telecareEscalation from '../services/telecare-escalation-service.js';
import telecareDeviceMonitoring from '../services/telecare-device-monitoring-service.js';
import telecareService from '../services/telecare-service.js';
import FhirDeviceMetric from '../models/FhirDeviceMetric.js';
import Patient from '../models/PatientSchema.js';
import RelatedPerson from '../models/RelatedPerson.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';
import { setOrgContext, requireRole, requirePermission } from '../middleware/rbac.js';
import { verifyAccessToken } from '../middleware/auth.js';
import { verifyDeviceToken } from '../middleware/deviceAuth.js';
import { io } from '../app.js';

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
         * Device Health Monitoring
         * Note: These routes must be defined BEFORE /admin/devices/:deviceId
         * to prevent the parameterized route from matching 'health' as a deviceId
         */

        // GET /telecare/admin/devices/health - Get device health summary
        this.router.get('/admin/devices/health',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { organizationId } = req;
                    const health = await telecareDeviceMonitoring.getHealthSummary(organizationId);
                    res.json(health);
                } catch (error) {
                    console.error('Error getting device health:', error);
                    res.status(500).json({ error: 'Failed to get device health' });
                }
            }
        );

        // POST /telecare/admin/devices/health/check - Run immediate health check
        this.router.post('/admin/devices/health/check',
            requireRole('org_admin', 'super_admin'),
            async (req, res) => {
                try {
                    const result = await telecareDeviceMonitoring.runImmediateCheck();
                    res.json({
                        message: 'Health check completed',
                        ...result
                    });
                } catch (error) {
                    console.error('Error running health check:', error);
                    res.status(500).json({ error: 'Failed to run health check' });
                }
            }
        );

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

        // GET /telecare/admin/outcome-codes - Get alarm outcome codes
        this.router.get('/admin/outcome-codes',
            requirePermission('devices:read'),
            telecareController.getOutcomeCodes.bind(telecareController)
        );

        /**
         * Statistics
         */

        // GET /telecare/admin/stats - Get telecare statistics
        this.router.get('/admin/stats',
            requirePermission('devices:read'),
            telecareController.getStatistics.bind(telecareController)
        );

        // GET /telecare/admin/devices/:deviceId/status-history - Get device status history (PostgreSQL)
        this.router.get('/admin/devices/:deviceId/status-history',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { deviceId } = req.params;
                    const { limit = 50 } = req.query;
                    const history = await telecareDeviceMonitoring.getDeviceStatusHistory(deviceId, parseInt(limit));
                    res.json(history);
                } catch (error) {
                    console.error('Error getting device status history:', error);
                    res.status(500).json({ error: 'Failed to get status history' });
                }
            }
        );

        // GET /telecare/admin/devices/:deviceId/metrics - Get FHIR DeviceMetric history
        this.router.get('/admin/devices/:deviceId/metrics',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { deviceId } = req.params;
                    const { limit = 100, since } = req.query;
                    const history = await FhirDeviceMetric.getHistory(deviceId, {
                        limit: parseInt(limit),
                        since
                    });
                    res.json(history);
                } catch (error) {
                    console.error('Error getting device metrics:', error);
                    res.status(500).json({ error: 'Failed to get device metrics' });
                }
            }
        );

        // GET /telecare/admin/devices/:deviceId/uptime - Get device uptime statistics
        this.router.get('/admin/devices/:deviceId/uptime',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { deviceId } = req.params;
                    const { hours = 24 } = req.query;
                    const stats = await FhirDeviceMetric.getUptimeStats(deviceId, parseInt(hours));
                    res.json(stats);
                } catch (error) {
                    console.error('Error getting device uptime:', error);
                    res.status(500).json({ error: 'Failed to get uptime stats' });
                }
            }
        );

        // GET /telecare/admin/metrics/recent - Get recent status changes across all devices
        this.router.get('/admin/metrics/recent',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { minutes = 60 } = req.query;
                    const changes = await FhirDeviceMetric.getRecentChanges(parseInt(minutes));
                    res.json(changes);
                } catch (error) {
                    console.error('Error getting recent metrics:', error);
                    res.status(500).json({ error: 'Failed to get recent metrics' });
                }
            }
        );

        // GET /telecare/admin/devices/:deviceId/power-status - Get device power status
        this.router.get('/admin/devices/:deviceId/power-status',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { deviceId } = req.params;
                    const { history, limit = 50 } = req.query;

                    if (history === 'true') {
                        // Return power status history
                        const events = await FhirDeviceMetric.getPowerHistory(deviceId, {
                            limit: parseInt(limit)
                        });
                        res.json({
                            deviceId,
                            history: events.map(e => ({
                                powerStatus: e.powerStatus,
                                previousPowerStatus: e.previousPowerStatus,
                                batteryPercent: e.batteryPercent,
                                timestamp: e.timestamp
                            }))
                        });
                    } else {
                        // Return current power status
                        const current = await FhirDeviceMetric.getCurrentPowerStatus(deviceId);
                        res.json({
                            deviceId,
                            powerStatus: current?.powerStatus || 'unknown',
                            batteryPercent: current?.batteryPercent,
                            lastUpdated: current?.timestamp || null
                        });
                    }
                } catch (error) {
                    console.error('Error getting device power status:', error);
                    res.status(500).json({ error: 'Failed to get power status' });
                }
            }
        );

        // GET /telecare/admin/devices/:deviceId/patient - Get linked patient and related persons
        this.router.get('/admin/devices/:deviceId/patient',
            requirePermission('devices:read'),
            async (req, res) => {
                try {
                    const { deviceId } = req.params;

                    // Get device to find patient_id
                    const device = await telecareService.getDevice(deviceId);
                    if (!device) {
                        return res.status(404).json({ error: 'Device not found' });
                    }

                    if (!device.patient_id) {
                        return res.json({ patient: null, relatedPersons: [] });
                    }

                    // Fetch patient from MongoDB (patient_id could be FHIR id or MongoDB _id)
                    let patient = await Patient.findOne({ id: device.patient_id });
                    if (!patient) {
                        // Try by MongoDB _id
                        patient = await Patient.findById(device.patient_id).catch(() => null);
                    }
                    if (!patient) {
                        return res.json({ patient: null, relatedPersons: [] });
                    }

                    // Use the FHIR id for RelatedPerson lookup
                    const patientFhirId = patient.id;

                    // Fetch related persons for this patient
                    const relatedPersons = await RelatedPerson.find({
                        'patient.reference': { $in: [`Patient/${patientFhirId}`, patientFhirId, `Patient/${device.patient_id}`, device.patient_id] }
                    });

                    // Format patient response
                    const patientResponse = {
                        id: patient.id,
                        name: patient.name?.[0] ? {
                            given: patient.name[0].given?.join(' '),
                            family: patient.name[0].family,
                            full: `${patient.name[0].given?.join(' ') || ''} ${patient.name[0].family || ''}`.trim()
                        } : null,
                        gender: patient.gender,
                        birthDate: patient.birthDate,
                        address: patient.address?.[0] ? {
                            line: patient.address[0].line?.join(', '),
                            city: patient.address[0].city,
                            postalCode: patient.address[0].postalCode,
                            full: [
                                patient.address[0].line?.join(', '),
                                patient.address[0].city,
                                patient.address[0].postalCode
                            ].filter(Boolean).join(', ')
                        } : null,
                        telecom: patient.telecom?.map(t => ({
                            system: t.system,
                            value: t.value,
                            use: t.use
                        })) || [],
                        identifier: patient.identifier?.find(i => i.system?.includes('nhs'))?.value || null,
                        medicalInfo: patient.medicalInfo || null
                    };

                    // Format related persons
                    const relatedPersonsResponse = relatedPersons.map(rp => ({
                        id: rp.id,
                        name: rp.name?.[0] ? {
                            given: rp.name[0].given?.join(' '),
                            family: rp.name[0].family,
                            full: `${rp.name[0].given?.join(' ') || ''} ${rp.name[0].family || ''}`.trim()
                        } : null,
                        relationship: rp.relationship?.[0]?.coding?.[0]?.display ||
                            rp.relationship?.[0]?.coding?.[0]?.code || 'Contact',
                        telecom: rp.telecom?.map(t => ({
                            system: t.system,
                            value: t.value,
                            use: t.use
                        })) || []
                    }));

                    res.json({
                        patient: patientResponse,
                        relatedPersons: relatedPersonsResponse
                    });
                } catch (error) {
                    console.error('Error getting device patient data:', error);
                    res.status(500).json({ error: 'Failed to get patient data' });
                }
            }
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
        // Device Self-Provisioning (device JWT auth)
        // ==========================================

        // POST /telecare/devices/provision - Pi self-provisions during onboarding
        this.router.post('/devices/provision',
            verifyDeviceToken,
            telecareController.provisionDevice.bind(telecareController)
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

        // GET /telecare/outcome-codes - Get alarm outcome codes (for agent)
        this.router.get('/outcome-codes',
            verifyAccessToken,
            telecareController.getOutcomeCodes.bind(telecareController)
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

        // GET /telecare/devices/health - Get device health summary (for agent)
        this.router.get('/devices/health',
            verifyAccessToken,
            async (req, res) => {
                try {
                    const { organizationId } = req;
                    const health = await telecareDeviceMonitoring.getHealthSummary(organizationId);
                    res.json(health);
                } catch (error) {
                    console.error('Error getting device health:', error);
                    res.status(500).json({ error: 'Failed to get device health' });
                }
            }
        );

        // POST /telecare/devices/:deviceId/power-status - Report power status from Pi UPS service
        this.router.post('/devices/:deviceId/power-status',
            verifyAccessToken,
            async (req, res) => {
                try {
                    const { deviceId } = req.params;
                    const { powerStatus, batteryPercent } = req.body;

                    if (!powerStatus || !['mains', 'battery', 'unknown'].includes(powerStatus)) {
                        return res.status(400).json({
                            error: 'Invalid powerStatus. Must be: mains, battery, or unknown'
                        });
                    }

                    // Verify device exists
                    const device = await telecareService.getDevice(deviceId);
                    if (!device) {
                        return res.status(404).json({ error: 'Device not found' });
                    }

                    // Log the power status change
                    const metric = await FhirDeviceMetric.logPowerStatusChange({
                        deviceId,
                        powerStatus,
                        batteryPercent: batteryPercent !== undefined ? parseInt(batteryPercent) : undefined,
                        context: {
                            organizationId: device.organization_id
                        }
                    });

                    // Emit WebSocket event for real-time updates
                    if (io) {
                        io.emit('telecarePowerStatus', {
                            deviceId,
                            powerStatus,
                            batteryPercent: metric.batteryPercent,
                            previousPowerStatus: metric.previousPowerStatus,
                            timestamp: metric.timestamp
                        });
                    }

                    res.json({
                        message: 'Power status updated',
                        metric: {
                            id: metric.id,
                            deviceId: metric.deviceId,
                            powerStatus: metric.powerStatus,
                            previousPowerStatus: metric.previousPowerStatus,
                            batteryPercent: metric.batteryPercent,
                            timestamp: metric.timestamp
                        }
                    });
                } catch (error) {
                    console.error('Error updating power status:', error);
                    res.status(500).json({ error: 'Failed to update power status' });
                }
            }
        );
    }

    getRouter() {
        return this.router;
    }
}

export default new TelecareRoutes().getRouter();
