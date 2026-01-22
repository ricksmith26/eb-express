import AsteriskManager from 'asterisk-manager';
import queueController from '../controllers/queue-controller.js';
import telecareService from './telecare-service.js';

const LOG_PREFIX = '[AsteriskAMI]';

class AsteriskAMIService {
    constructor() {
        this.ami = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
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
