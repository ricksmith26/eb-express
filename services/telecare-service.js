import pool from '../config/postgres.js';
import crypto from 'crypto';

class TelecareService {
    // ==========================================
    // Device Management
    // ==========================================

    async listDevices({ organizationId, isActive, limit = 50, offset = 0 }) {
        let query = `
            SELECT
                td.*,
                pa.password as sip_password,
                pe.transport, pe.webrtc, pe.context
            FROM telecare_devices td
            LEFT JOIN ps_auths pa ON pa.id = td.device_id
            LEFT JOIN ps_endpoints pe ON pe.id = td.device_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (organizationId) {
            query += ` AND td.organization_id = $${paramIndex++}`;
            params.push(organizationId);
        }

        if (isActive !== undefined) {
            query += ` AND td.is_active = $${paramIndex++}`;
            params.push(isActive);
        }

        query += ` ORDER BY td.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    async getDevice(deviceId) {
        const query = `
            SELECT
                td.*,
                pa.password as sip_password,
                pe.transport, pe.webrtc, pe.context,
                aor.max_contacts, aor.qualify_frequency
            FROM telecare_devices td
            LEFT JOIN ps_auths pa ON pa.id = td.device_id
            LEFT JOIN ps_endpoints pe ON pe.id = td.device_id
            LEFT JOIN ps_aors aor ON aor.id = td.device_id
            WHERE td.device_id = $1
        `;
        const result = await pool.query(query, [deviceId]);
        return result.rows[0] || null;
    }

    async createDevice({
        deviceId,
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
        deviceType,
        deviceModel,
        organizationId,
        fhirDeviceId,
        patientId,
        notes
    }) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Generate secure password for SIP auth
            const sipPassword = this.generateSecurePassword();

            // 1. Create ps_auths entry
            await client.query(`
                INSERT INTO ps_auths (id, auth_type, username, password)
                VALUES ($1, 'userpass', $1, $2)
                ON CONFLICT (id) DO UPDATE SET password = $2
            `, [deviceId, sipPassword]);

            // 2. Create ps_aors entry
            await client.query(`
                INSERT INTO ps_aors (id, max_contacts, qualify_frequency, remove_existing)
                VALUES ($1, 1, 60, 'yes')
                ON CONFLICT (id) DO NOTHING
            `, [deviceId]);

            // 3. Create ps_endpoints entry (configured for WebRTC/WSS)
            await client.query(`
                INSERT INTO ps_endpoints (
                    id, transport, aors, auth, context, disallow, allow,
                    direct_media, force_rport, rewrite_contact, rtp_symmetric,
                    dtmf_mode, message_context, webrtc
                ) VALUES (
                    $1, 'wss_transport', $1, $1, 'from-telecare', 'all', 'opus,ulaw,alaw',
                    'no', 'yes', 'yes', 'yes',
                    'rfc4733', 'telecare-messages', 'yes'
                )
                ON CONFLICT (id) DO NOTHING
            `, [deviceId]);

            // 4. Create telecare_devices entry
            const deviceResult = await client.query(`
                INSERT INTO telecare_devices (
                    device_id, user_name, user_address, user_phone,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
                    secondary_contact_name, secondary_contact_phone,
                    gp_name, gp_phone, device_type, device_model,
                    organization_id, fhir_device_id, patient_id, notes, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)
                ON CONFLICT (device_id) DO UPDATE SET
                    user_name = EXCLUDED.user_name,
                    user_address = EXCLUDED.user_address,
                    user_phone = EXCLUDED.user_phone,
                    emergency_contact_name = EXCLUDED.emergency_contact_name,
                    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
                    emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
                    secondary_contact_name = EXCLUDED.secondary_contact_name,
                    secondary_contact_phone = EXCLUDED.secondary_contact_phone,
                    gp_name = EXCLUDED.gp_name,
                    gp_phone = EXCLUDED.gp_phone,
                    device_type = EXCLUDED.device_type,
                    device_model = EXCLUDED.device_model,
                    organization_id = EXCLUDED.organization_id,
                    fhir_device_id = EXCLUDED.fhir_device_id,
                    patient_id = EXCLUDED.patient_id,
                    notes = EXCLUDED.notes,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                deviceId, userName, userAddress, userPhone,
                emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
                secondaryContactName, secondaryContactPhone,
                gpName, gpPhone, deviceType, deviceModel,
                organizationId, fhirDeviceId, patientId, notes
            ]);

            await client.query('COMMIT');

            return {
                ...deviceResult.rows[0],
                sipPassword
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async updateDevice(deviceId, updates) {
        const allowedFields = [
            'user_name', 'user_address', 'user_phone',
            'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
            'secondary_contact_name', 'secondary_contact_phone',
            'gp_name', 'gp_phone', 'device_type', 'device_model',
            'organization_id', 'fhir_device_id', 'patient_id', 'notes', 'is_active'
        ];

        const setClauses = [];
        const params = [deviceId];
        let paramIndex = 2;

        for (const [key, value] of Object.entries(updates)) {
            const snakeKey = this.camelToSnake(key);
            if (allowedFields.includes(snakeKey)) {
                setClauses.push(`${snakeKey} = $${paramIndex++}`);
                params.push(value);
            }
        }

        if (setClauses.length === 0) {
            return this.getDevice(deviceId);
        }

        const query = `
            UPDATE telecare_devices
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $1
            RETURNING *
        `;

        const result = await pool.query(query, params);
        return result.rows[0];
    }

    async deactivateDevice(deviceId) {
        const result = await pool.query(`
            UPDATE telecare_devices
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $1
            RETURNING *
        `, [deviceId]);
        return result.rows[0];
    }

    async deleteDevice(deviceId) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Delete in reverse order of dependencies
            await client.query('DELETE FROM telecare_devices WHERE device_id = $1', [deviceId]);
            await client.query('DELETE FROM ps_endpoints WHERE id = $1', [deviceId]);
            await client.query('DELETE FROM ps_aors WHERE id = $1', [deviceId]);
            await client.query('DELETE FROM ps_auths WHERE id = $1', [deviceId]);

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async linkToPatient(deviceId, patientId, fhirDeviceId = null) {
        const result = await pool.query(`
            UPDATE telecare_devices
            SET patient_id = $2, fhir_device_id = $3, updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $1
            RETURNING *
        `, [deviceId, patientId, fhirDeviceId]);
        return result.rows[0];
    }

    async getDeviceCredentials(deviceId) {
        const result = await pool.query(`
            SELECT pa.id as device_id, pa.password as sip_password
            FROM ps_auths pa
            WHERE pa.id = $1
        `, [deviceId]);
        return result.rows[0] || null;
    }

    /**
     * Get device with full user/patient information for incoming calls.
     * Used by queue controller to enrich emergencyCallConnection events.
     */
    async getDeviceWithPatientInfo(deviceId) {
        const result = await pool.query(`
            SELECT
                td.device_id,
                td.user_name,
                td.user_address,
                td.user_phone,
                td.emergency_contact_name,
                td.emergency_contact_phone,
                td.emergency_contact_relationship,
                td.secondary_contact_name,
                td.secondary_contact_phone,
                td.gp_name,
                td.gp_phone,
                td.device_type,
                td.device_model,
                td.patient_id,
                td.fhir_device_id,
                td.is_active
            FROM telecare_devices td
            WHERE td.device_id = $1 AND td.is_active = true
        `, [deviceId]);
        return result.rows[0] || null;
    }

    async regeneratePassword(deviceId) {
        const newPassword = this.generateSecurePassword();
        await pool.query(`
            UPDATE ps_auths SET password = $2 WHERE id = $1
        `, [deviceId, newPassword]);
        return newPassword;
    }

    // ==========================================
    // Alarm Events
    // ==========================================

    async listAlarms({ deviceId, acknowledged, limit = 50, offset = 0 }) {
        let query = `
            SELECT ae.*, td.user_name, td.user_address, td.user_phone
            FROM alarm_events ae
            LEFT JOIN telecare_devices td ON td.device_id = ae.device_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (deviceId) {
            query += ` AND ae.device_id = $${paramIndex++}`;
            params.push(deviceId);
        }

        if (acknowledged === true) {
            query += ` AND ae.acknowledged_at IS NOT NULL`;
        } else if (acknowledged === false) {
            query += ` AND ae.acknowledged_at IS NULL`;
        }

        query += ` ORDER BY ae.received_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    async getAlarm(alarmId) {
        const result = await pool.query(`
            SELECT ae.*, td.user_name, td.user_address, td.user_phone,
                   td.emergency_contact_name, td.emergency_contact_phone,
                   td.gp_name, td.gp_phone
            FROM alarm_events ae
            LEFT JOIN telecare_devices td ON td.device_id = ae.device_id
            WHERE ae.id = $1
        `, [alarmId]);
        return result.rows[0] || null;
    }

    async acknowledgeAlarm(alarmId, acknowledgedBy, { notes = null, outcomeCode = null } = {}) {
        const result = await pool.query(`
            UPDATE alarm_events
            SET acknowledged_at = CURRENT_TIMESTAMP,
                acknowledged_by = $2,
                notes = COALESCE($3, notes),
                outcome_code = COALESCE($4, outcome_code)
            WHERE id = $1
            RETURNING *
        `, [alarmId, acknowledgedBy, notes, outcomeCode]);
        return result.rows[0];
    }

    /**
     * Get available outcome codes for alarm acknowledgment
     */
    async getOutcomeCodes() {
        const result = await pool.query(`
            SELECT code, label, description, requires_followup
            FROM alarm_outcome_codes
            WHERE is_active = true
            ORDER BY display_order
        `);
        return result.rows;
    }

    async getUnacknowledgedCount() {
        const result = await pool.query(`
            SELECT COUNT(*) as count FROM alarm_events WHERE acknowledged_at IS NULL
        `);
        return parseInt(result.rows[0].count);
    }

    async getRecentAlarmsByDevice(deviceId, limit = 10) {
        const result = await pool.query(`
            SELECT * FROM alarm_events
            WHERE device_id = $1
            ORDER BY received_at DESC
            LIMIT $2
        `, [deviceId, limit]);
        return result.rows;
    }

    /**
     * Get the most recent unacknowledged alarm for a device.
     * Used to trigger escalation when a telecare call comes in.
     */
    async getMostRecentUnacknowledgedAlarm(deviceId) {
        const result = await pool.query(`
            SELECT * FROM alarm_events
            WHERE device_id = $1 AND acknowledged_at IS NULL
            ORDER BY received_at DESC
            LIMIT 1
        `, [deviceId]);
        return result.rows[0] || null;
    }

    // ==========================================
    // Statistics
    // ==========================================

    async getStatistics(organizationId = null) {
        let orgFilter = '';
        const params = [];

        if (organizationId) {
            orgFilter = 'WHERE organization_id = $1';
            params.push(organizationId);
        }

        const [devices, alarms] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true) as active_devices,
                    COUNT(*) FILTER (WHERE is_active = false) as inactive_devices,
                    COUNT(*) as total_devices
                FROM telecare_devices ${orgFilter}
            `, params),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE acknowledged_at IS NULL) as unacknowledged_alarms,
                    COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours') as alarms_today,
                    COUNT(*) as total_alarms
                FROM alarm_events
            `)
        ]);

        return {
            devices: {
                active: parseInt(devices.rows[0].active_devices),
                inactive: parseInt(devices.rows[0].inactive_devices),
                total: parseInt(devices.rows[0].total_devices)
            },
            alarms: {
                unacknowledged: parseInt(alarms.rows[0].unacknowledged_alarms),
                today: parseInt(alarms.rows[0].alarms_today),
                total: parseInt(alarms.rows[0].total_alarms)
            }
        };
    }

    // ==========================================
    // Response Time Tracking
    // ==========================================

    /**
     * Update a timestamp field for the most recent unacknowledged alarm.
     * Used to track call_started_at and call_answered_at for compliance metrics.
     */
    async updateAlarmTimestamp(deviceId, field) {
        const validFields = ['call_started_at', 'call_answered_at'];
        if (!validFields.includes(field)) {
            throw new Error(`Invalid field: ${field}`);
        }

        const result = await pool.query(`
            UPDATE alarm_events
            SET ${field} = NOW()
            WHERE id = (
                SELECT id FROM alarm_events
                WHERE device_id = $1
                  AND acknowledged_at IS NULL
                  AND ${field} IS NULL
                ORDER BY received_at DESC
                LIMIT 1
            )
            RETURNING id, device_id, ${field}
        `, [deviceId]);

        return result.rows[0] || null;
    }

    /**
     * Get response time metrics for compliance reporting.
     * Returns average and percentile response times.
     */
    async getResponseTimeMetrics(startDate, endDate, organizationId = null) {
        let query = `
            SELECT
                COUNT(*) as total_alarms,
                COUNT(*) FILTER (WHERE call_answered_at IS NOT NULL) as answered_alarms,
                AVG(EXTRACT(EPOCH FROM (call_answered_at - received_at)))
                    FILTER (WHERE call_answered_at IS NOT NULL) as avg_response_seconds,
                AVG(EXTRACT(EPOCH FROM (acknowledged_at - received_at)))
                    FILTER (WHERE acknowledged_at IS NOT NULL) as avg_resolution_seconds,
                PERCENTILE_CONT(0.95) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (call_answered_at - received_at))
                ) FILTER (WHERE call_answered_at IS NOT NULL) as p95_response_seconds,
                MIN(EXTRACT(EPOCH FROM (call_answered_at - received_at)))
                    FILTER (WHERE call_answered_at IS NOT NULL) as min_response_seconds,
                MAX(EXTRACT(EPOCH FROM (call_answered_at - received_at)))
                    FILTER (WHERE call_answered_at IS NOT NULL) as max_response_seconds
            FROM alarm_events
            WHERE received_at BETWEEN $1 AND $2
        `;
        const params = [startDate, endDate];

        const result = await pool.query(query, params);
        const row = result.rows[0];

        return {
            totalAlarms: parseInt(row.total_alarms) || 0,
            answeredAlarms: parseInt(row.answered_alarms) || 0,
            avgResponseSeconds: parseFloat(row.avg_response_seconds) || null,
            avgResolutionSeconds: parseFloat(row.avg_resolution_seconds) || null,
            p95ResponseSeconds: parseFloat(row.p95_response_seconds) || null,
            minResponseSeconds: parseFloat(row.min_response_seconds) || null,
            maxResponseSeconds: parseFloat(row.max_response_seconds) || null
        };
    }

    // ==========================================
    // Utilities
    // ==========================================

    generateSecurePassword(length = 16) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            password += chars[randomBytes[i] % chars.length];
        }
        return password;
    }

    camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    async getNextAvailableDeviceId(prefix = 'TC') {
        const result = await pool.query(`
            SELECT device_id FROM telecare_devices
            WHERE device_id LIKE $1
            ORDER BY device_id DESC LIMIT 1
        `, [`${prefix}-%`]);

        if (result.rows.length === 0) {
            return `${prefix}-0001`;
        }

        const lastId = result.rows[0].device_id;
        const numPart = parseInt(lastId.split('-').pop()) + 1;
        return `${prefix}-${numPart.toString().padStart(4, '0')}`;
    }
}

export default new TelecareService();
