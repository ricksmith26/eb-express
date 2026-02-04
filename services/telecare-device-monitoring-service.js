/**
 * Telecare Device Monitoring Service
 * Monitors SIP registration status of telecare devices via AMI and PJSIP.
 * Detects offline devices and emits alerts.
 *
 * This is SEPARATE from device-connection-service.js which handles web/app socket connections.
 * Telecare devices use SIP registration - status is checked via AMI for real-time accuracy.
 */
import pool from '../config/postgres.js';
import asteriskAMI from './asterisk-ami-service.js';

class TelecareDeviceMonitoringService {
    constructor() {
        this.agenda = null;
        this.io = null;
        this.initialized = false;
        // Buffer time beyond qualify_frequency before considering device offline (seconds)
        this.offlineBuffer = 60;
    }

    /**
     * Initialize the monitoring service with Agenda and Socket.IO
     */
    async initialize(agenda, io) {
        if (this.initialized) {
            console.log('[TelecareMonitor] Already initialized');
            return;
        }

        this.agenda = agenda;
        this.io = io;

        // Define the monitoring job
        agenda.define('telecare-device-health-check', async (job) => {
            await this.checkDeviceHealth();
        });

        // Schedule health check every 5 minutes
        await agenda.every('5 minutes', 'telecare-device-health-check');

        this.initialized = true;
        console.log('[TelecareMonitor] Telecare device monitoring initialized (every 5 minutes)');
    }

    /**
     * Check health of all active telecare devices
     */
    async checkDeviceHealth() {
        console.log('[TelecareMonitor] Running device health check...');

        try {
            // Get all active telecare devices with their expected qualify frequency
            // Note: Asterisk stores contacts with aor in the id field as "DEVICE_ID;@hash"
            // or in the aor column directly. We check both.
            const devicesResult = await pool.query(`
                SELECT
                    td.device_id,
                    td.user_name,
                    td.user_phone,
                    td.organization_id,
                    aor.qualify_frequency,
                    pc.uri,
                    pc.expiration_time,
                    pc.qualify_timers_running,
                    EXTRACT(EPOCH FROM (NOW() - pc.reg_server::timestamp)) as seconds_since_registration
                FROM telecare_devices td
                LEFT JOIN ps_aors aor ON aor.id = td.device_id
                LEFT JOIN ps_contacts pc ON (
                    pc.aor = td.device_id
                    OR pc.id LIKE td.device_id || ';%'
                    OR pc.id LIKE td.device_id || '^3B%'
                )
                WHERE td.is_active = true
                  AND td.device_id LIKE 'TC-%'
            `);

            const devices = devicesResult.rows;
            console.log(`[TelecareMonitor] Checking ${devices.length} active telecare devices`);

            let onlineCount = 0;
            let offlineCount = 0;
            const offlineDevices = [];

            for (const device of devices) {
                const qualifyFrequency = device.qualify_frequency || 120;
                const maxAllowedAge = qualifyFrequency + this.offlineBuffer;

                // Device is online if it has a contact entry and registration is recent
                const isOnline = device.uri &&
                    device.seconds_since_registration !== null &&
                    device.seconds_since_registration < maxAllowedAge;

                if (isOnline) {
                    onlineCount++;
                    // Check if device was previously offline and resolve the event
                    await this.resolveOfflineEvent(device.device_id);
                } else {
                    offlineCount++;
                    offlineDevices.push({
                        deviceId: device.device_id,
                        userName: device.user_name,
                        userPhone: device.user_phone,
                        lastSeen: device.seconds_since_registration
                            ? new Date(Date.now() - device.seconds_since_registration * 1000)
                            : null,
                        organizationId: device.organization_id
                    });

                    // Record offline event and potentially notify
                    await this.handleOfflineDevice(device);
                }
            }

            console.log(`[TelecareMonitor] Health check complete: ${onlineCount} online, ${offlineCount} offline`);

            // Emit summary to admin dashboard
            if (this.io && offlineDevices.length > 0) {
                this.io.emit('telecareDeviceHealthUpdate', {
                    online: onlineCount,
                    offline: offlineCount,
                    offlineDevices: offlineDevices.slice(0, 10), // Limit to first 10
                    timestamp: new Date().toISOString()
                });
            }

            return { online: onlineCount, offline: offlineCount, offlineDevices };

        } catch (error) {
            console.error('[TelecareMonitor] Error during health check:', error);
            throw error;
        }
    }

    /**
     * Handle an offline device - record event and notify if new
     */
    async handleOfflineDevice(device) {
        try {
            // Check if there's already an unresolved offline event for this device
            const existingEvent = await pool.query(`
                SELECT id, notification_sent FROM telecare_device_status_events
                WHERE device_id = $1 AND status = 'offline' AND resolved_at IS NULL
                LIMIT 1
            `, [device.device_id]);

            if (existingEvent.rows.length > 0) {
                // Already tracked, check if we need to send notification
                if (!existingEvent.rows[0].notification_sent) {
                    await this.sendOfflineNotification(device);
                    await pool.query(`
                        UPDATE telecare_device_status_events
                        SET notification_sent = true
                        WHERE id = $1
                    `, [existingEvent.rows[0].id]);
                }
                return;
            }

            // Record new offline event
            const lastSeen = device.seconds_since_registration
                ? new Date(Date.now() - device.seconds_since_registration * 1000)
                : null;

            await pool.query(`
                INSERT INTO telecare_device_status_events
                (device_id, status, previous_status, last_seen, notification_sent)
                VALUES ($1, 'offline', 'online', $2, false)
            `, [device.device_id, lastSeen]);

            console.log(`[TelecareMonitor] Recorded offline event for ${device.device_id}`);

            // Send notification
            await this.sendOfflineNotification(device);

            // Update the event to mark notification as sent
            await pool.query(`
                UPDATE telecare_device_status_events
                SET notification_sent = true
                WHERE device_id = $1 AND status = 'offline' AND resolved_at IS NULL
            `, [device.device_id]);

        } catch (error) {
            console.error(`[TelecareMonitor] Error handling offline device ${device.device_id}:`, error);
        }
    }

    /**
     * Send notification about offline device
     */
    async sendOfflineNotification(device) {
        console.log(`[TelecareMonitor] Sending offline notification for ${device.device_id} (${device.user_name})`);

        // Emit Socket.IO event to all connected agents/admins
        if (this.io) {
            this.io.emit('telecareDeviceOffline', {
                deviceId: device.device_id,
                userName: device.user_name,
                userPhone: device.user_phone,
                organizationId: device.organization_id,
                lastSeen: device.seconds_since_registration
                    ? new Date(Date.now() - device.seconds_since_registration * 1000).toISOString()
                    : null,
                message: `Telecare device ${device.device_id} is offline`,
                timestamp: new Date().toISOString()
            });
        }

        // TODO: Could also send email/SMS to supervisors here
    }

    /**
     * Resolve an offline event when device comes back online
     */
    async resolveOfflineEvent(deviceId) {
        try {
            const result = await pool.query(`
                UPDATE telecare_device_status_events
                SET resolved_at = NOW(), notes = 'Device came back online'
                WHERE device_id = $1 AND status = 'offline' AND resolved_at IS NULL
                RETURNING id
            `, [deviceId]);

            if (result.rows.length > 0) {
                console.log(`[TelecareMonitor] Resolved offline event for ${deviceId} - device back online`);

                // Emit Socket.IO event
                if (this.io) {
                    this.io.emit('telecareDeviceOnline', {
                        deviceId,
                        message: `Telecare device ${deviceId} is back online`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } catch (error) {
            console.error(`[TelecareMonitor] Error resolving offline event for ${deviceId}:`, error);
        }
    }

    /**
     * Get current device health summary
     * Uses AMI to check real-time PJSIP contact reachability
     */
    async getHealthSummary() {
        try {
            // Get all active telecare devices
            const devicesResult = await pool.query(`
                SELECT device_id, user_name, user_phone
                FROM telecare_devices
                WHERE is_active = true AND device_id LIKE 'TC-%'
            `);

            const devices = devicesResult.rows;
            const total = devices.length;

            // Get real-time contact status from AMI
            let onlineDevices = new Set();
            const amiConnected = asteriskAMI.isConnected();
            console.log(`[TelecareMonitor] AMI connected: ${amiConnected}`);

            if (amiConnected) {
                const contacts = await asteriskAMI.getPJSIPContacts();
                console.log(`[TelecareMonitor] AMI contacts:`, JSON.stringify(contacts));
                for (const contact of contacts) {
                    // Extract device ID from AOR (e.g., "TC-1000")
                    // Status can be 'Reachable', 'Available', 'Avail', etc.
                    const isReachable = contact.status &&
                        ['Reachable', 'Available', 'Avail'].some(s =>
                            contact.status.toLowerCase().includes(s.toLowerCase())
                        );
                    if (contact.aor && contact.aor.startsWith('TC-') && isReachable) {
                        onlineDevices.add(contact.aor);
                    }
                }
                console.log(`[TelecareMonitor] Online devices from AMI:`, [...onlineDevices]);
            }

            if (!amiConnected) {
                // Fallback to database check if AMI not connected
                // Check expiration_time to see if contact is still valid
                const contactsResult = await pool.query(`
                    SELECT id, aor, expiration_time
                    FROM ps_contacts
                    WHERE expiration_time > EXTRACT(EPOCH FROM NOW())
                `);
                for (const contact of contactsResult.rows) {
                    // Extract device ID from id field (format: "TC-1000^3B@hash")
                    const match = contact.id?.match(/^(TC-\d+)/);
                    if (match) {
                        onlineDevices.add(match[1]);
                    } else if (contact.aor?.startsWith('TC-')) {
                        onlineDevices.add(contact.aor);
                    }
                }
            }

            const online = devices.filter(d => onlineDevices.has(d.device_id)).length;

            // Get unresolved offline events
            const offlineEvents = await pool.query(`
                SELECT
                    dse.device_id,
                    dse.last_seen,
                    dse.detected_at,
                    td.user_name,
                    td.user_phone
                FROM telecare_device_status_events dse
                LEFT JOIN telecare_devices td ON td.device_id = dse.device_id
                WHERE dse.status = 'offline' AND dse.resolved_at IS NULL
                ORDER BY dse.detected_at DESC
            `);

            return {
                online,
                offline: total - online,
                total,
                offlineDevices: offlineEvents.rows.map(row => ({
                    deviceId: row.device_id,
                    userName: row.user_name,
                    userPhone: row.user_phone,
                    lastSeen: row.last_seen,
                    offlineSince: row.detected_at
                }))
            };
        } catch (error) {
            console.error('[TelecareMonitor] Error getting health summary:', error);
            throw error;
        }
    }

    /**
     * Get device status history
     */
    async getDeviceStatusHistory(deviceId, limit = 50) {
        const result = await pool.query(`
            SELECT * FROM telecare_device_status_events
            WHERE device_id = $1
            ORDER BY detected_at DESC
            LIMIT $2
        `, [deviceId, limit]);
        return result.rows;
    }

    /**
     * Run an immediate health check (for testing or on-demand)
     */
    async runImmediateCheck() {
        return this.checkDeviceHealth();
    }
}

export default new TelecareDeviceMonitoringService();
