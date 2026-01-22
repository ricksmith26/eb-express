import escalationConfig from '../config/telecare-escalation.js';
import telecareService from './telecare-service.js';
import pool from '../config/postgres.js';

const LOG_PREFIX = '[TelecareEscalation]';

class TelecareEscalationService {
    constructor() {
        this.agenda = null;
        this.io = null;
    }

    /**
     * Initialize the escalation service with Agenda and Socket.IO
     */
    async initialize(agenda, io) {
        this.agenda = agenda;
        this.io = io;

        // Ensure config table exists
        await escalationConfig.initialize();

        // Define the escalation check job
        this.agenda.define('telecare-alarm-escalation', async (job) => {
            const { alarmId, deviceId, tier, retryCount, organizationId } = job.attrs.data;
            console.log(`${LOG_PREFIX} [Job] Processing escalation - alarm: ${alarmId}, tier: ${tier}, retry: ${retryCount}`);
            await this.processEscalation(alarmId, deviceId, tier, retryCount, organizationId);
        });

        console.log(`${LOG_PREFIX} Escalation service initialized`);
    }

    /**
     * Schedule escalation for a new alarm
     * Called when an alarm is received from a telecare device
     */
    async scheduleEscalation(alarmId, deviceId, organizationId = null) {
        if (!this.agenda) {
            console.error(`${LOG_PREFIX} Agenda not initialized - cannot schedule escalation`);
            return;
        }

        const config = await escalationConfig.getConfig(organizationId);

        if (!config.enabled) {
            console.log(`${LOG_PREFIX} Escalation disabled for org: ${organizationId || 'global'}`);
            return;
        }

        console.log(`${LOG_PREFIX} Scheduling escalation for alarm ${alarmId} (device: ${deviceId})`);
        console.log(`${LOG_PREFIX} Config: first=${config.firstEscalationSeconds}s, second=${config.secondEscalationSeconds}s`);

        // Schedule first tier escalation
        await this.agenda.schedule(
            `in ${config.firstEscalationSeconds} seconds`,
            'telecare-alarm-escalation',
            {
                alarmId,
                deviceId,
                tier: 1,
                retryCount: 0,
                organizationId
            }
        );

        console.log(`${LOG_PREFIX} First escalation scheduled for alarm ${alarmId} in ${config.firstEscalationSeconds}s`);
    }

    /**
     * Cancel escalation for an alarm (called when alarm is acknowledged)
     */
    async cancelEscalation(alarmId) {
        if (!this.agenda) {
            console.error(`${LOG_PREFIX} Agenda not initialized - cannot cancel escalation`);
            return;
        }

        const numRemoved = await this.agenda.cancel({
            name: 'telecare-alarm-escalation',
            'data.alarmId': alarmId
        });

        if (numRemoved > 0) {
            console.log(`${LOG_PREFIX} Cancelled ${numRemoved} escalation job(s) for alarm ${alarmId}`);
        }
    }

    /**
     * Process an escalation check
     */
    async processEscalation(alarmId, deviceId, tier, retryCount, organizationId) {
        // Check if alarm is still unacknowledged
        const alarm = await telecareService.getAlarm(alarmId);

        if (!alarm) {
            console.log(`${LOG_PREFIX} Alarm ${alarmId} not found - skipping escalation`);
            return;
        }

        if (alarm.acknowledged_at) {
            console.log(`${LOG_PREFIX} Alarm ${alarmId} already acknowledged - skipping escalation`);
            return;
        }

        const config = await escalationConfig.getConfig(organizationId);

        // Get device info for escalation data
        const device = await telecareService.getDevice(deviceId);
        const escalationData = {
            alarmId,
            deviceId,
            tier,
            retryCount,
            alarm: {
                id: alarm.id,
                type: alarm.alarm_type,
                code: alarm.alarm_code,
                receivedAt: alarm.received_at
            },
            user: device ? {
                name: device.user_name,
                address: device.user_address,
                phone: device.user_phone
            } : null,
            timestamp: new Date().toISOString()
        };

        if (tier === 1) {
            // First tier: Alert all agents again
            console.log(`${LOG_PREFIX} TIER 1 ESCALATION - Alarm ${alarmId} unanswered after ${config.firstEscalationSeconds}s`);

            // Emit to all connected agents
            if (this.io) {
                this.io.emit('alarmEscalation', {
                    ...escalationData,
                    message: `URGENT: Alarm from ${device?.user_name || deviceId} unanswered for ${config.firstEscalationSeconds} seconds`,
                    priority: 'high'
                });
                console.log(`${LOG_PREFIX} Emitted alarmEscalation event (tier 1) to all clients`);
            }

            // Log escalation event
            await this.logEscalationEvent(alarmId, 1, 'Tier 1 escalation - alerted agents');

            // Schedule tier 2
            const tier2Delay = config.secondEscalationSeconds - config.firstEscalationSeconds;
            if (tier2Delay > 0) {
                await this.agenda.schedule(
                    `in ${tier2Delay} seconds`,
                    'telecare-alarm-escalation',
                    {
                        alarmId,
                        deviceId,
                        tier: 2,
                        retryCount,
                        organizationId
                    }
                );
                console.log(`${LOG_PREFIX} Tier 2 escalation scheduled in ${tier2Delay}s`);
            }

        } else if (tier === 2) {
            // Second tier: Notify supervisor
            console.log(`${LOG_PREFIX} TIER 2 ESCALATION - Alarm ${alarmId} unanswered after ${config.secondEscalationSeconds}s`);

            // Emit critical escalation
            if (this.io) {
                this.io.emit('alarmEscalation', {
                    ...escalationData,
                    message: `CRITICAL: Alarm from ${device?.user_name || deviceId} requires supervisor attention`,
                    priority: 'critical'
                });
                console.log(`${LOG_PREFIX} Emitted alarmEscalation event (tier 2) to all clients`);
            }

            // Notify supervisor if configured
            if (config.supervisorEmail || config.supervisorPhone) {
                await this.notifySupervisor(alarmId, device, alarm, config);
            }

            // Log escalation event
            await this.logEscalationEvent(alarmId, 2, 'Tier 2 escalation - supervisor notified');

            // Schedule retry if under max
            if (retryCount < config.maxRetries) {
                await this.agenda.schedule(
                    `in ${config.firstEscalationSeconds} seconds`,
                    'telecare-alarm-escalation',
                    {
                        alarmId,
                        deviceId,
                        tier: 2,
                        retryCount: retryCount + 1,
                        organizationId
                    }
                );
                console.log(`${LOG_PREFIX} Retry ${retryCount + 1}/${config.maxRetries} scheduled`);
            } else {
                console.log(`${LOG_PREFIX} Max retries (${config.maxRetries}) reached for alarm ${alarmId}`);
                await this.logEscalationEvent(alarmId, 2, `Max retries reached (${config.maxRetries})`);
            }
        }
    }

    /**
     * Log escalation event to database
     */
    async logEscalationEvent(alarmId, tier, message) {
        try {
            await pool.query(`
                INSERT INTO alarm_escalation_events (alarm_id, tier, message, created_at)
                VALUES ($1, $2, $3, NOW())
            `, [alarmId, tier, message]);
        } catch (error) {
            // Table might not exist, create it
            if (error.code === '42P01') {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS alarm_escalation_events (
                        id SERIAL PRIMARY KEY,
                        alarm_id INTEGER REFERENCES alarm_events(id),
                        tier INTEGER NOT NULL,
                        message TEXT,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                `);
                await pool.query(`
                    INSERT INTO alarm_escalation_events (alarm_id, tier, message, created_at)
                    VALUES ($1, $2, $3, NOW())
                `, [alarmId, tier, message]);
            } else {
                console.error(`${LOG_PREFIX} Error logging escalation event:`, error.message);
            }
        }
    }

    /**
     * Notify supervisor via email/SMS
     */
    async notifySupervisor(alarmId, device, alarm, config) {
        const message = `CRITICAL ALARM: Unacknowledged alarm from ${device?.user_name || 'Unknown'} (${device?.device_id || 'Unknown device'}). Alarm type: ${alarm.alarm_type}. Received at: ${alarm.received_at}. Please respond immediately.`;

        if (config.supervisorEmail) {
            console.log(`${LOG_PREFIX} [TODO] Send email to supervisor: ${config.supervisorEmail}`);
            // TODO: Integrate with email service (SES, etc.)
        }

        if (config.supervisorPhone) {
            console.log(`${LOG_PREFIX} [TODO] Send SMS to supervisor: ${config.supervisorPhone}`);
            // TODO: Integrate with SMS service (Twilio, etc.)
        }
    }

    /**
     * Get escalation history for an alarm
     */
    async getEscalationHistory(alarmId) {
        try {
            const result = await pool.query(`
                SELECT * FROM alarm_escalation_events
                WHERE alarm_id = $1
                ORDER BY created_at ASC
            `, [alarmId]);
            return result.rows;
        } catch (error) {
            if (error.code === '42P01') {
                return []; // Table doesn't exist yet
            }
            throw error;
        }
    }

    /**
     * Get pending escalations count
     */
    async getPendingEscalationsCount() {
        if (!this.agenda) return 0;

        const jobs = await this.agenda.jobs({
            name: 'telecare-alarm-escalation',
            nextRunAt: { $ne: null }
        });

        return jobs.length;
    }
}

export default new TelecareEscalationService();
