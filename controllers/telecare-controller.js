import telecareService from '../services/telecare-service.js';
import telecareEscalation from '../services/telecare-escalation-service.js';

class TelecareController {
    // ==========================================
    // Device Endpoints
    // ==========================================

    async listDevices(req, res) {
        try {
            const { organizationId } = req;
            const { active, limit = 50, offset = 0 } = req.query;

            const isActive = active === 'true' ? true : active === 'false' ? false : undefined;

            const devices = await telecareService.listDevices({
                organizationId,
                isActive,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.json({
                resourceType: 'Bundle',
                type: 'searchset',
                total: devices.length,
                entry: devices.map(d => ({
                    resource: this.formatDeviceResponse(d)
                }))
            });
        } catch (error) {
            console.error('Error listing telecare devices:', error);
            res.status(500).json({ error: 'Failed to list devices', code: 'DEVICE_LIST_ERROR' });
        }
    }

    async getDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const device = await telecareService.getDevice(deviceId);

            if (!device) {
                return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
            }

            res.json(this.formatDeviceResponse(device));
        } catch (error) {
            console.error('Error getting telecare device:', error);
            res.status(500).json({ error: 'Failed to get device', code: 'DEVICE_GET_ERROR' });
        }
    }

    async createDevice(req, res) {
        try {
            const { organizationId } = req;
            // Contact info is stored in MongoDB (Patient/RelatedPerson) - not in PostgreSQL
            const {
                deviceId,
                deviceType,
                deviceModel,
                fhirDeviceId,
                patientId,
                notes
            } = req.body;

            // Generate device ID if not provided
            const finalDeviceId = deviceId || await telecareService.getNextAvailableDeviceId();

            const device = await telecareService.createDevice({
                deviceId: finalDeviceId,
                deviceType,
                deviceModel,
                organizationId,
                fhirDeviceId,
                patientId,
                notes
            });

            res.status(201).json({
                message: 'Device created successfully',
                device: this.formatDeviceResponse(device),
                credentials: {
                    deviceId: finalDeviceId,
                    sipPassword: device.sipPassword,
                    sipServer: 'asterisk.brigid-personal-assistant.com',
                    sipPort: 5060,
                    wssPort: 4443,
                    transport: 'wss'
                }
            });
        } catch (error) {
            console.error('Error creating telecare device:', error);
            if (error.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'Device ID already exists', code: 'DEVICE_EXISTS' });
            }
            res.status(500).json({ error: 'Failed to create device', code: 'DEVICE_CREATE_ERROR' });
        }
    }

    async updateDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const updates = req.body;

            const device = await telecareService.updateDevice(deviceId, updates);

            if (!device) {
                return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
            }

            res.json(this.formatDeviceResponse(device));
        } catch (error) {
            console.error('Error updating telecare device:', error);
            res.status(500).json({ error: 'Failed to update device', code: 'DEVICE_UPDATE_ERROR' });
        }
    }

    async deactivateDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const device = await telecareService.deactivateDevice(deviceId);

            if (!device) {
                return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
            }

            res.json({ message: 'Device deactivated', device: this.formatDeviceResponse(device) });
        } catch (error) {
            console.error('Error deactivating telecare device:', error);
            res.status(500).json({ error: 'Failed to deactivate device', code: 'DEVICE_DEACTIVATE_ERROR' });
        }
    }

    async deleteDevice(req, res) {
        try {
            const { deviceId } = req.params;
            await telecareService.deleteDevice(deviceId);
            res.json({ message: 'Device deleted successfully' });
        } catch (error) {
            console.error('Error deleting telecare device:', error);
            res.status(500).json({ error: 'Failed to delete device', code: 'DEVICE_DELETE_ERROR' });
        }
    }

    async linkToPatient(req, res) {
        try {
            const { deviceId } = req.params;
            const { patientId, fhirDeviceId } = req.body;

            if (!patientId) {
                return res.status(400).json({ error: 'patientId is required', code: 'MISSING_PATIENT_ID' });
            }

            const device = await telecareService.linkToPatient(deviceId, patientId, fhirDeviceId);

            if (!device) {
                return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
            }

            res.json({
                message: 'Device linked to patient',
                device: this.formatDeviceResponse(device)
            });
        } catch (error) {
            console.error('Error linking device to patient:', error);
            res.status(500).json({ error: 'Failed to link device', code: 'DEVICE_LINK_ERROR' });
        }
    }

    async getCredentials(req, res) {
        try {
            const { deviceId } = req.params;
            const credentials = await telecareService.getDeviceCredentials(deviceId);

            if (!credentials) {
                return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
            }

            res.json({
                deviceId: credentials.device_id,
                sipPassword: credentials.sip_password,
                sipServer: 'asterisk.brigid-personal-assistant.com',
                sipPort: 5060,
                wssPort: 4443,
                transport: 'wss'
            });
        } catch (error) {
            console.error('Error getting device credentials:', error);
            res.status(500).json({ error: 'Failed to get credentials', code: 'CREDENTIALS_ERROR' });
        }
    }

    async regeneratePassword(req, res) {
        try {
            const { deviceId } = req.params;
            const newPassword = await telecareService.regeneratePassword(deviceId);

            res.json({
                message: 'Password regenerated',
                deviceId,
                sipPassword: newPassword
            });
        } catch (error) {
            console.error('Error regenerating password:', error);
            res.status(500).json({ error: 'Failed to regenerate password', code: 'PASSWORD_REGEN_ERROR' });
        }
    }

    // ==========================================
    // Alarm Endpoints
    // ==========================================

    async listAlarms(req, res) {
        try {
            const { deviceId, acknowledged, limit = 50, offset = 0 } = req.query;

            const ack = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;

            const alarms = await telecareService.listAlarms({
                deviceId,
                acknowledged: ack,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.json({
                resourceType: 'Bundle',
                type: 'searchset',
                total: alarms.length,
                entry: alarms.map(a => ({
                    resource: this.formatAlarmResponse(a)
                }))
            });
        } catch (error) {
            console.error('Error listing alarms:', error);
            res.status(500).json({ error: 'Failed to list alarms', code: 'ALARM_LIST_ERROR' });
        }
    }

    async getAlarm(req, res) {
        try {
            const { alarmId } = req.params;
            const alarm = await telecareService.getAlarm(alarmId);

            if (!alarm) {
                return res.status(404).json({ error: 'Alarm not found', code: 'ALARM_NOT_FOUND' });
            }

            res.json(this.formatAlarmResponse(alarm));
        } catch (error) {
            console.error('Error getting alarm:', error);
            res.status(500).json({ error: 'Failed to get alarm', code: 'ALARM_GET_ERROR' });
        }
    }

    async acknowledgeAlarm(req, res) {
        try {
            const { alarmId } = req.params;
            const { notes, outcomeCode } = req.body;
            const acknowledgedBy = req.user?.email || req.practitioner?.email || 'system';

            const alarm = await telecareService.acknowledgeAlarm(alarmId, acknowledgedBy, { notes, outcomeCode });

            if (!alarm) {
                return res.status(404).json({ error: 'Alarm not found', code: 'ALARM_NOT_FOUND' });
            }

            // Cancel any pending escalation jobs for this alarm
            await telecareEscalation.cancelEscalation(parseInt(alarmId));

            res.json({
                message: 'Alarm acknowledged',
                alarm: this.formatAlarmResponse(alarm)
            });
        } catch (error) {
            console.error('Error acknowledging alarm:', error);
            res.status(500).json({ error: 'Failed to acknowledge alarm', code: 'ALARM_ACK_ERROR' });
        }
    }

    async getOutcomeCodes(req, res) {
        try {
            const codes = await telecareService.getOutcomeCodes();
            res.json(codes);
        } catch (error) {
            console.error('Error getting outcome codes:', error);
            res.status(500).json({ error: 'Failed to get outcome codes', code: 'OUTCOME_CODES_ERROR' });
        }
    }

    // ==========================================
    // Statistics Endpoint
    // ==========================================

    async getStatistics(req, res) {
        try {
            const { organizationId } = req;
            const stats = await telecareService.getStatistics(organizationId);
            res.json(stats);
        } catch (error) {
            console.error('Error getting statistics:', error);
            res.status(500).json({ error: 'Failed to get statistics', code: 'STATS_ERROR' });
        }
    }

    // ==========================================
    // Response Formatters
    // ==========================================

    formatDeviceResponse(device) {
        // Contact info (user, emergencyContact, secondaryContact, gp) is stored in MongoDB
        // Patient and RelatedPerson collections - not in PostgreSQL telecare_devices table
        return {
            resourceType: 'TelecareDevice',
            id: device.device_id,
            status: device.is_active ? 'active' : 'inactive',
            deviceType: device.device_type,
            deviceModel: device.device_model,
            sipConfig: {
                transport: device.transport,
                webrtc: device.webrtc === 'yes',
                context: device.context
            },
            references: {
                fhirDeviceId: device.fhir_device_id,
                patientId: device.patient_id,
                organizationId: device.organization_id
            },
            notes: device.notes,
            lastRegistration: device.last_registration,
            lastAlarm: device.last_alarm,
            createdAt: device.created_at,
            updatedAt: device.updated_at
        };
    }

    formatAlarmResponse(alarm) {
        // Contact info (user, emergencyContact, gp) is stored in MongoDB
        // Use patientId to lookup from Patient and RelatedPerson collections
        return {
            resourceType: 'TelecareAlarm',
            id: alarm.id,
            deviceId: alarm.device_id,
            alarmType: alarm.alarm_type,
            alarmCode: alarm.alarm_code,
            location: alarm.location,
            patientId: alarm.patient_id,
            receivedAt: alarm.received_at,
            acknowledged: !!alarm.acknowledged_at,
            acknowledgedAt: alarm.acknowledged_at,
            acknowledgedBy: alarm.acknowledged_by,
            outcomeCode: alarm.outcome_code,
            call: alarm.call_id ? {
                callId: alarm.call_id,
                startedAt: alarm.call_started_at,
                endedAt: alarm.call_ended_at,
                duration: alarm.call_duration
            } : undefined,
            notes: alarm.notes
        };
    }
}

export default new TelecareController();
