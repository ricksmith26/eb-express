import AsteriskManager from 'asterisk-manager';
import queueController from '../controllers/queue-controller.js';
import telecareService from './telecare-service.js';
import telecareEscalation from './telecare-escalation-service.js';
import FhirDeviceMetric from '../models/FhirDeviceMetric.js';

const LOG_PREFIX = '[AsteriskAMI]';

class AsteriskAMIService {
    constructor() {
        this.ami = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.io = null;  // Socket.IO instance for real-time updates
    }

    /**
     * Set Socket.IO instance for emitting real-time events
     */
    setSocketIO(io) {
        this.io = io;
        console.log(`${LOG_PREFIX} Socket.IO instance set for real-time updates`);
    }

    /**
     * Initialize connection to Asterisk AMI
     */
    connect(config = {}) {
        const host = config.host || process.env.ASTERISK_AMI_HOST || '127.0.0.1';
        const port = config.port || process.env.ASTERISK_AMI_PORT || 5038;
        const username = config.username || process.env.ASTERISK_AMI_USERNAME || 'brigid-backend';
        const password = config.password || process.env.ASTERISK_AMI_PASSWORD || 'ChangeMeToSecurePassword123!';

        console.log(`${LOG_PREFIX} Connecting to Asterisk AMI at ${host}:${port}`);

        this.ami = new AsteriskManager(port, host, username, password, true);

        this.ami.keepConnected();

        // Connection events
        this.ami.on('connect', () => {
            console.log(`${LOG_PREFIX} Connected to Asterisk AMI`);
            this.connected = true;
            this.reconnectAttempts = 0;
        });

        this.ami.on('error', (err) => {
            console.error(`${LOG_PREFIX} AMI Error:`, err.message);
        });

        this.ami.on('close', () => {
            console.log(`${LOG_PREFIX} AMI connection closed`);
            this.connected = false;
        });

        // Queue events - when a caller joins the queue
        this.ami.on('queuecallerjoin', (event) => {
            console.log(`${LOG_PREFIX} [QueueCallerJoin] Caller joined queue:`, JSON.stringify(event));
            this.handleCallerJoinQueue(event);
        });

        // Queue events - when a caller leaves the queue
        this.ami.on('queuecallerleave', (event) => {
            console.log(`${LOG_PREFIX} [QueueCallerLeave] Caller left queue:`, JSON.stringify(event));
        });

        // Queue events - when an agent connects to caller
        this.ami.on('agentconnect', (event) => {
            console.log(`${LOG_PREFIX} [AgentConnect] Agent connected:`, JSON.stringify(event));
            this.handleAgentConnect(event);
        });

        // Queue events - when call completes
        this.ami.on('agentcomplete', (event) => {
            console.log(`${LOG_PREFIX} [AgentComplete] Call completed:`, JSON.stringify(event));
            this.handleAgentComplete(event);
        });

        // PJSIP Contact status events - for telecare device monitoring
        this.ami.on('contactstatus', (event) => {
            this.handleContactStatusChange(event);
        });

        // Device state change events
        this.ami.on('devicestatechange', (event) => {
            if (event.device && event.device.startsWith('PJSIP/TC-')) {
                this.handleDeviceStateChange(event);
            }
        });

        return this;
    }

    /**
     * Handle when a Twilio caller joins the inbound queue
     */
    async handleCallerJoinQueue(event) {
        // Note: asterisk-manager returns lowercase property names
        const { queue, channel, calleridnum, calleridname, position } = event;

        if (queue !== 'inbound-queue') {
            console.log(`${LOG_PREFIX} Ignoring event for queue: ${queue}`);
            return;
        }

        console.log(`${LOG_PREFIX} New inbound caller: ${calleridnum} (${calleridname}) in position ${position}`);

        // Create customer object for queue controller
        const customer = {
            type: 'inbound-phone',
            channel: channel,
            callerIdNum: calleridnum,
            callerIdName: calleridname,
            queue: queue,
            position: position,
            timestamp: new Date().toISOString()
        };

        // Add to queue controller - this will trigger pairing if agent available
        try {
            const result = await queueController.addCustomerToQueue(customer);
            console.log(`${LOG_PREFIX} Customer added to queue controller:`, result);

            // For telecare devices, trigger escalation if there's an unacknowledged alarm
            if (calleridnum && calleridnum.startsWith('TC-')) {
                console.log(`${LOG_PREFIX} Telecare device detected: ${calleridnum} - checking for alarm escalation`);
                const alarm = await telecareService.getMostRecentUnacknowledgedAlarm(calleridnum);
                if (alarm) {
                    console.log(`${LOG_PREFIX} Found unacknowledged alarm ${alarm.id} - scheduling escalation`);
                    await telecareEscalation.scheduleEscalation(alarm.id, calleridnum);
                } else {
                    console.log(`${LOG_PREFIX} No unacknowledged alarm found for device ${calleridnum}`);
                }
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error adding customer to queue:`, error);
        }
    }

    /**
     * Handle when an agent connects to a caller - update call_answered_at for telecare alarms
     */
    async handleAgentConnect(event) {
        // Note: asterisk-manager returns lowercase property names
        // channel is the caller's channel (e.g., PJSIP/TC-TEST-001-00000001)
        const { queue, channel, destchannel } = event;

        // Check if this is a telecare device call (channel starts with PJSIP/TC-)
        if (!channel || !channel.startsWith('PJSIP/TC-')) {
            return; // Not a telecare call, ignore
        }

        // Extract device ID from channel name
        // Format: PJSIP/TC-xxx-xxxxxxxx (8 hex digits at end are call counter)
        const match = channel.match(/^PJSIP\/(TC-[^-]+-[^-]+)-/);
        if (!match) {
            // Try simpler format: PJSIP/TC-xxx-xxxxxxxx
            const simpleMatch = channel.match(/^PJSIP\/(TC-[^-]+)-/);
            if (!simpleMatch) {
                console.log(`${LOG_PREFIX} Could not extract device ID from channel: ${channel}`);
                return;
            }
            var deviceId = simpleMatch[1];
        } else {
            var deviceId = match[1];
        }

        console.log(`${LOG_PREFIX} Telecare call answered - Device: ${deviceId}, Agent: ${destchannel}`);

        try {
            const result = await telecareService.updateAlarmTimestamp(deviceId, 'call_answered_at');
            if (result) {
                console.log(`${LOG_PREFIX} Updated call_answered_at for alarm ${result.id} (device: ${deviceId})`);
            } else {
                console.log(`${LOG_PREFIX} No pending alarm found for device ${deviceId}`);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error updating alarm timestamp:`, error);
        }
    }

    /**
     * Handle when a call completes - remove agent from Asterisk queue
     */
    async handleAgentComplete(event) {
        // Note: asterisk-manager returns lowercase property names
        // interface is the SIP endpoint, membername is the display name
        const { queue, interface: agentInterface, membername } = event;

        if (queue !== 'inbound-queue') {
            console.log(`${LOG_PREFIX} Ignoring agentcomplete for queue: ${queue}`);
            return;
        }

        console.log(`${LOG_PREFIX} Call completed for agent: ${agentInterface} (${membername}) - removing from queue`);

        try {
            await this.removeAgentFromAsteriskQueue(agentInterface, queue);
            console.log(`${LOG_PREFIX} Agent ${agentInterface} removed from Asterisk queue after call completion`);
        } catch (error) {
            console.error(`${LOG_PREFIX} Error removing agent from queue after call:`, error);
        }
    }

    /**
     * Handle PJSIP contact status change events
     * Emits real-time updates via Socket.IO for telecare device monitoring
     * Logs all status changes to FHIR DeviceMetric for history
     */
    async handleContactStatusChange(event) {
        // Event format: { aor, uri, contactstatus, roundtripusec }
        const { aor, contactstatus, uri } = event;

        // Only process telecare devices (TC-xxxx)
        if (!aor || !aor.startsWith('TC-')) {
            return;
        }

        const isReachable = contactstatus === 'Reachable';
        const status = isReachable ? 'online' : 'offline';
        const timestamp = new Date();

        console.log(`${LOG_PREFIX} [ContactStatus] ${aor}: ${contactstatus}`);

        // Log to FHIR DeviceMetric for history
        try {
            await FhirDeviceMetric.logStatusChange({
                deviceId: aor,
                status,
                contactStatus: contactstatus,
                uri,
                timestamp,
                source: 'ami-contact-status'
            });
            console.log(`${LOG_PREFIX} Logged status to FHIR: ${aor} -> ${status}`);
        } catch (err) {
            console.error(`${LOG_PREFIX} Error logging to FHIR:`, err.message);
        }

        // Emit Socket.IO event for real-time frontend updates
        if (this.io) {
            this.io.emit('telecareDeviceStatus', {
                deviceId: aor,
                status,
                contactStatus: contactstatus,
                uri,
                timestamp: timestamp.toISOString()
            });
            console.log(`${LOG_PREFIX} Emitted telecareDeviceStatus: ${aor} -> ${contactstatus}`);
        }
    }

    /**
     * Handle device state change events
     * Alternative event for tracking endpoint reachability
     * Logs all status changes to FHIR DeviceMetric for history
     */
    async handleDeviceStateChange(event) {
        // Event format: { device, state }
        const { device, state } = event;

        // Extract device ID from "PJSIP/TC-1000"
        const match = device?.match(/^PJSIP\/(TC-\d+)/);
        if (!match) return;

        const deviceId = match[1];
        const isOnline = state !== 'UNAVAILABLE' && state !== 'UNKNOWN';
        const status = isOnline ? 'online' : 'offline';
        const timestamp = new Date();

        console.log(`${LOG_PREFIX} [DeviceState] ${deviceId}: ${state}`);

        // Log to FHIR DeviceMetric for history
        try {
            await FhirDeviceMetric.logStatusChange({
                deviceId,
                status,
                deviceState: state,
                timestamp,
                source: 'ami-device-state'
            });
        } catch (err) {
            console.error(`${LOG_PREFIX} Error logging device state to FHIR:`, err.message);
        }

        // Emit Socket.IO event
        if (this.io) {
            this.io.emit('telecareDeviceStatus', {
                deviceId,
                status,
                deviceState: state,
                timestamp: timestamp.toISOString()
            });
        }
    }

    /**
     * Add an agent to the Asterisk queue
     * Called when agent is paired with customer
     */
    async addAgentToAsteriskQueue(agentEndpoint, queueName = 'inbound-queue') {
        if (!this.connected) {
            throw new Error('Not connected to AMI');
        }

        console.log(`${LOG_PREFIX} Adding agent ${agentEndpoint} to queue ${queueName}`);

        return new Promise((resolve, reject) => {
            this.ami.action({
                action: 'QueueAdd',
                queue: queueName,
                interface: agentEndpoint,
                penalty: 0,
                paused: 'false'
            }, (err, response) => {
                if (err) {
                    console.error(`${LOG_PREFIX} Error adding agent to queue:`, err);
                    reject(err);
                } else {
                    console.log(`${LOG_PREFIX} Agent added to queue:`, response);
                    resolve(response);
                }
            });
        });
    }

    /**
     * Remove an agent from the Asterisk queue
     */
    async removeAgentFromAsteriskQueue(agentEndpoint, queueName = 'inbound-queue') {
        if (!this.connected) {
            throw new Error('Not connected to AMI');
        }

        console.log(`${LOG_PREFIX} Removing agent ${agentEndpoint} from queue ${queueName}`);

        return new Promise((resolve, reject) => {
            this.ami.action({
                action: 'QueueRemove',
                queue: queueName,
                interface: agentEndpoint
            }, (err, response) => {
                if (err) {
                    console.error(`${LOG_PREFIX} Error removing agent from queue:`, err);
                    reject(err);
                } else {
                    console.log(`${LOG_PREFIX} Agent removed from queue:`, response);
                    resolve(response);
                }
            });
        });
    }

    /**
     * Get current queue status
     */
    async getQueueStatus(queueName = 'inbound-queue') {
        if (!this.connected) {
            throw new Error('Not connected to AMI');
        }

        return new Promise((resolve, reject) => {
            this.ami.action({
                action: 'QueueStatus',
                queue: queueName
            }, (err, response) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Originate a call to an agent for queue pickup
     */
    async originateCallToAgent(agentEndpoint, channel) {
        if (!this.connected) {
            throw new Error('Not connected to AMI');
        }

        console.log(`${LOG_PREFIX} Originating call to agent ${agentEndpoint}`);

        return new Promise((resolve, reject) => {
            this.ami.action({
                action: 'Originate',
                channel: agentEndpoint,
                application: 'Bridge',
                data: channel,
                callerid: 'Inbound Call <inbound>',
                timeout: 30000,
                async: 'true'
            }, (err, response) => {
                if (err) {
                    console.error(`${LOG_PREFIX} Error originating call:`, err);
                    reject(err);
                } else {
                    console.log(`${LOG_PREFIX} Call originated:`, response);
                    resolve(response);
                }
            });
        });
    }

    /**
     * Get PJSIP endpoint status for telecare devices
     * Returns a map of device_id -> { status: 'Reachable'|'Unreachable', ... }
     */
    async getPJSIPEndpointStatuses(deviceIds = []) {
        if (!this.connected) {
            console.log(`${LOG_PREFIX} Not connected to AMI, cannot check endpoint status`);
            return {};
        }

        const statuses = {};

        for (const deviceId of deviceIds) {
            try {
                const status = await new Promise((resolve, reject) => {
                    this.ami.action({
                        action: 'PJSIPShowEndpoint',
                        endpoint: deviceId
                    }, (err, response) => {
                        if (err) {
                            resolve({ status: 'Unknown', error: err.message });
                        } else {
                            // The response contains device state info
                            resolve({
                                status: response.devicestate || 'Unknown',
                                activeChannels: response.activechannels || '0'
                            });
                        }
                    });
                });
                statuses[deviceId] = status;
            } catch (e) {
                statuses[deviceId] = { status: 'Unknown', error: e.message };
            }
        }

        return statuses;
    }

    /**
     * Get all PJSIP contacts with their reachability status
     * Uses PJSIPShowContacts AMI action
     */
    async getPJSIPContacts() {
        if (!this.connected) {
            console.log(`${LOG_PREFIX} Not connected to AMI, cannot check contacts`);
            return [];
        }

        return new Promise((resolve, reject) => {
            const contacts = [];

            // Set up event handler for contact info events
            const contactHandler = (event) => {
                if (event.event === 'ContactStatusDetail') {
                    contacts.push({
                        aor: event.aor,
                        uri: event.uri,
                        status: event.status, // 'Reachable', 'Unreachable', etc.
                        roundtripUsec: event.roundtripusec
                    });
                }
            };

            this.ami.on('contactstatusdetail', contactHandler);

            this.ami.action({
                action: 'PJSIPShowContacts'
            }, (err, response) => {
                // Remove the event handler after we get the response
                this.ami.removeListener('contactstatusdetail', contactHandler);

                if (err) {
                    console.error(`${LOG_PREFIX} Error getting PJSIP contacts:`, err);
                    resolve([]);
                } else {
                    // Give a short delay to collect all contact events
                    setTimeout(() => {
                        resolve(contacts);
                    }, 100);
                }
            });
        });
    }

    /**
     * Check if connected to AMI
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Disconnect from AMI
     */
    disconnect() {
        if (this.ami) {
            this.ami.disconnect();
            this.connected = false;
            console.log(`${LOG_PREFIX} Disconnected from AMI`);
        }
    }
}

export default new AsteriskAMIService();
