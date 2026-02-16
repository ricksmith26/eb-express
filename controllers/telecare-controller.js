import telecareService from '../services/telecare-service.js';
import telecareEscalation from '../services/telecare-escalation-service.js';
import Patient from '../models/PatientSchema.js';
import RelatedPerson from '../models/RelatedPerson.js';

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
    // Device Self-Provisioning (called by Pi during onboarding)
    // ==========================================

    async provisionDevice(req, res) {
        try {
            const {
                deviceId,
                deviceType = 'fixed_unit',
                email,
                userName,
                userAddress,
                userPhone,
                emergencyContactName,
                emergencyContactPhone,
                emergencyContactRelationship,
                secondaryContactName,
                secondaryContactPhone,
                gpName,
                gpPhone,
                patientId: existingPatientId,
            } = req.body;

            if (!deviceId) {
                return res.status(400).json({ error: 'deviceId is required', code: 'MISSING_DEVICE_ID' });
            }
            if (!email) {
                return res.status(400).json({ error: 'email is required', code: 'MISSING_EMAIL' });
            }

            // 1. Find or create Patient by email
            let patient = await Patient.findOne({
                'telecom.system': 'email',
                'telecom.value': email
            });

            // Parse name parts
            const nameParts = (userName || '').trim().split(/\s+/);
            const givenNames = nameParts.slice(0, -1);
            const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || '';

            if (patient) {
                // Update existing patient with latest data from onboarding
                if (userName) {
                    patient.name = [{
                        use: 'official',
                        family: familyName,
                        given: givenNames.length > 0 ? givenNames : [familyName]
                    }];
                }
                if (userAddress) {
                    patient.address = [{ line: [userAddress] }];
                }
                // Update phone if provided
                if (userPhone) {
                    const phoneIdx = patient.telecom.findIndex(t => t.system === 'phone');
                    if (phoneIdx >= 0) {
                        patient.telecom[phoneIdx].value = userPhone;
                    } else {
                        patient.telecom.push({ system: 'phone', value: userPhone, use: 'mobile' });
                    }
                }
                // Update GP info
                if (gpName || gpPhone) {
                    if (!patient.medicalInfo) patient.medicalInfo = {};
                    if (gpName) patient.medicalInfo.gpPractice = gpName;
                    if (gpPhone) patient.medicalInfo.gpPhone = gpPhone;
                }
                await patient.save();
                console.log(`[Telecare] Updated existing patient: ${patient.id} (${email})`);
            } else {
                // Create new patient
                const telecom = [{ system: 'email', value: email, use: 'home' }];
                if (userPhone) {
                    telecom.push({ system: 'phone', value: userPhone, use: 'mobile' });
                }

                patient = new Patient({
                    name: [{
                        use: 'official',
                        family: familyName,
                        given: givenNames.length > 0 ? givenNames : [familyName]
                    }],
                    address: userAddress ? [{ line: [userAddress] }] : [],
                    telecom,
                    active: true,
                    medicalInfo: (gpName || gpPhone) ? {
                        gpPractice: gpName || undefined,
                        gpPhone: gpPhone || undefined,
                    } : undefined,
                });
                await patient.save();
                console.log(`[Telecare] Created new patient: ${patient.id} (${email})`);
            }

            // 2. Upsert emergency contacts as RelatedPerson
            const patientRef = `Patient/${patient.id}`;

            if (emergencyContactName) {
                const ecNameParts = emergencyContactName.trim().split(/\s+/);
                const ecFamily = ecNameParts.length > 1 ? ecNameParts[ecNameParts.length - 1] : ecNameParts[0];
                const ecGiven = ecNameParts.slice(0, -1);

                await RelatedPerson.findOneAndUpdate(
                    {
                        'patient.reference': patientRef,
                        'name.family': ecFamily,
                    },
                    {
                        $set: {
                            name: [{ family: ecFamily, given: ecGiven.length > 0 ? ecGiven : [ecFamily] }],
                            telecom: emergencyContactPhone
                                ? [{ system: 'phone', value: emergencyContactPhone, use: 'mobile' }]
                                : [],
                            relationship: [{
                                coding: [{
                                    system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
                                    code: 'FAMMEMB',
                                    display: emergencyContactRelationship || 'Family Member'
                                }]
                            }],
                            patient: { reference: patientRef },
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            if (secondaryContactName) {
                const scNameParts = secondaryContactName.trim().split(/\s+/);
                const scFamily = scNameParts.length > 1 ? scNameParts[scNameParts.length - 1] : scNameParts[0];
                const scGiven = scNameParts.slice(0, -1);

                await RelatedPerson.findOneAndUpdate(
                    {
                        'patient.reference': patientRef,
                        'name.family': scFamily,
                    },
                    {
                        $set: {
                            name: [{ family: scFamily, given: scGiven.length > 0 ? scGiven : [scFamily] }],
                            telecom: secondaryContactPhone
                                ? [{ system: 'phone', value: secondaryContactPhone, use: 'mobile' }]
                                : [],
                            relationship: [{
                                coding: [{
                                    system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
                                    code: 'FAMMEMB',
                                    display: 'Family Member'
                                }]
                            }],
                            patient: { reference: patientRef },
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            // 3. Create SIP credentials and telecare_devices entry in postgres
            const device = await telecareService.createDevice({
                deviceId,
                deviceType,
                patientId: patient.id,
                userName: userName || undefined,
                userAddress: userAddress || undefined,
                userPhone: userPhone || undefined,
                emergencyContactName: emergencyContactName || undefined,
                emergencyContactPhone: emergencyContactPhone || undefined,
                emergencyContactRelationship: emergencyContactRelationship || undefined,
                secondaryContactName: secondaryContactName || undefined,
                secondaryContactPhone: secondaryContactPhone || undefined,
                gpName: gpName || undefined,
                gpPhone: gpPhone || undefined,
            });

            console.log(`[Telecare] Provisioned device ${deviceId} for patient ${patient.id}`);

            res.status(201).json({
                deviceId,
                patientId: patient.id,
                sipPassword: device.sipPassword,
                sipServer: 'asterisk.brigid-personal-assistant.com',
                sipPort: 5060,
                wssPort: 4443,
                transport: 'wss'
            });
        } catch (error) {
            console.error('Error provisioning device:', error);
            if (error.code === '23505') {
                // Device already exists - return existing credentials
                try {
                    const credentials = await telecareService.getDeviceCredentials(req.body.deviceId);
                    if (credentials) {
                        const existingDevice = await telecareService.getDevice(req.body.deviceId);
                        return res.status(200).json({
                            deviceId: req.body.deviceId,
                            patientId: existingDevice?.patient_id || null,
                            sipPassword: credentials.sip_password,
                            sipServer: 'asterisk.brigid-personal-assistant.com',
                            sipPort: 5060,
                            wssPort: 4443,
                            transport: 'wss'
                        });
                    }
                } catch (fallbackErr) {
                    console.error('Error fetching existing credentials:', fallbackErr);
                }
            }
            res.status(500).json({ error: 'Failed to provision device', code: 'PROVISION_ERROR' });
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
