import AsteriskManager from 'asterisk-manager';
import queueController from '../controllers/queue-controller.js';

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
        const { Queue, Channel, CallerIDNum, CallerIDName, Position } = event;

        if (Queue !== 'inbound-queue') {
            console.log(`${LOG_PREFIX} Ignoring event for queue: ${Queue}`);
            return;
        }

        console.log(`${LOG_PREFIX} New inbound caller: ${CallerIDNum} (${CallerIDName}) in position ${Position}`);

        // Create customer object for queue controller
        const customer = {
            type: 'inbound-phone',
            channel: Channel,
            callerIdNum: CallerIDNum,
            callerIdName: CallerIDName,
            queue: Queue,
            position: Position,
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
     * Handle when a call completes - remove agent from Asterisk queue
     */
    async handleAgentComplete(event) {
        const { Queue, Member, MemberName } = event;

        if (Queue !== 'inbound-queue') {
            console.log(`${LOG_PREFIX} Ignoring agentcomplete for queue: ${Queue}`);
            return;
        }

        console.log(`${LOG_PREFIX} Call completed for agent: ${Member} (${MemberName}) - removing from queue`);

        try {
            await this.removeAgentFromAsteriskQueue(Member, Queue);
            console.log(`${LOG_PREFIX} Agent ${Member} removed from Asterisk queue after call completion`);
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
