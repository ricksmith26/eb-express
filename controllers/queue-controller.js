// import axios from 'axios';
// import qs from 'qs';
import { io } from '../app.js';
// import { users } from '../socketIo/socketIo.js';
import asteriskAMI from '../services/asterisk-ami-service.js';

const LOG_PREFIX = '[QueueController]';

export class QueueController {
    constructor() {
        this.customerQueue = [];
        this.agentQueue = []
        this.addCustomerToQueue = this.addCustomerToQueue.bind(this);
        this.addAgentToQueue = this.addAgentToQueue.bind(this);
        this.pairCustomerAndAgent = this.pairCustomerAndAgent.bind(this);
        this.takeFirst = this.takeFirst.bind(this);
        this.emitEventToPairing = this.emitEventToPairing.bind(this);
        this.removeByUsername = this.removeByUsername.bind(this);
        this.removeAgentFromQueue = this.removeAgentFromQueue.bind(this);
        console.log(`${LOG_PREFIX} Initialized - customerQueue: ${this.customerQueue.length}, agentQueue: ${this.agentQueue.length}`);
    }

    logQueueState(action) {
        console.log(`${LOG_PREFIX} [${action}] Queue state - customers: ${this.customerQueue.length}, agents: ${this.agentQueue.length}`);
        if (this.customerQueue.length > 0) {
            console.log(`${LOG_PREFIX} [${action}] Customer queue:`, JSON.stringify(this.customerQueue.map(c => c.username || c.id || 'unknown')));
        }
        if (this.agentQueue.length > 0) {
            console.log(`${LOG_PREFIX} [${action}] Agent queue:`, JSON.stringify(this.agentQueue.map(a => a.username || a.id || 'unknown')));
        }
    }

    async addCustomerToQueue(customer) {
        console.log(`${LOG_PREFIX} [addCustomerToQueue] START - customer:`, JSON.stringify(customer));
        try {
            this.customerQueue.push(customer)
            console.log(`${LOG_PREFIX} [addCustomerToQueue] Customer added to queue`);
            this.logQueueState('addCustomerToQueue');

            if (this.agentQueue.length > 0) {
                console.log(`${LOG_PREFIX} [addCustomerToQueue] Agent available - initiating pairing`);
                const data = this.pairCustomerAndAgent()
                console.log(`${LOG_PREFIX} [addCustomerToQueue] Emitting emergencyCallConnection event:`, JSON.stringify(data));
                io.emit('emergencyCallConnection', data)
                console.log(`${LOG_PREFIX} [addCustomerToQueue] SUCCESS - paired customer with agent`);
                return (data)
            } else {
                console.log(`${LOG_PREFIX} [addCustomerToQueue] No agents available - customer waiting in queue`);
                this.logQueueState('addCustomerToQueue-waiting');
                return 'Waiting in queue'
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} [addCustomerToQueue] ERROR:`, error.message, error.stack);
            throw error;
        }
    }

    async addAgentToQueue(agent) {
        console.log(`${LOG_PREFIX} [addAgentToQueue] START - agent:`, JSON.stringify(agent));
        try {
            this.agentQueue.push(agent)
            console.log(`${LOG_PREFIX} [addAgentToQueue] Agent added to queue`);
            this.logQueueState('addAgentToQueue');

            if (this.customerQueue.length > 0) {
                console.log(`${LOG_PREFIX} [addAgentToQueue] Customer waiting - initiating pairing`);
                const data = this.pairCustomerAndAgent()
                console.log(`${LOG_PREFIX} [addAgentToQueue] Emitting emergencyCallConnection event:`, JSON.stringify(data));
                io.emit('emergencyCallConnection', data)
                console.log(`${LOG_PREFIX} [addAgentToQueue] SUCCESS - paired agent with customer`);
                return ({ customer: data.customer, agent: data.agent })
            } else {
                console.log(`${LOG_PREFIX} [addAgentToQueue] No customers waiting - agent waiting in queue`);
                this.logQueueState('addAgentToQueue-waiting');
                return ('ok')
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} [addAgentToQueue] ERROR:`, error.message, error.stack);
            return (error)
        }
    }

    removeByUsername = (array, username) => {
        const beforeCount = array.length;
        const filtered = array.filter(item => item.username !== username);
        console.log(`${LOG_PREFIX} [removeByUsername] Removed ${beforeCount - filtered.length} item(s) with username: ${username}`);
        return filtered;
    };

    removeAgentFromQueue(username) {
        console.log(`${LOG_PREFIX} [removeAgentFromQueue] START - removing agent: ${username}`);
        const beforeCount = this.agentQueue.length;
        const adjustedQueue = this.removeByUsername(this.agentQueue, username)
        this.agentQueue = adjustedQueue
        const removed = beforeCount - this.agentQueue.length;
        if (removed > 0) {
            console.log(`${LOG_PREFIX} [removeAgentFromQueue] SUCCESS - removed agent: ${username}`);
        } else {
            console.log(`${LOG_PREFIX} [removeAgentFromQueue] Agent not found in queue: ${username}`);
        }
        this.logQueueState('removeAgentFromQueue');
    }

    pairCustomerAndAgent() {
        console.log(`${LOG_PREFIX} [pairCustomerAndAgent] START - pairing customer and agent`);
        const customerData = this.takeFirst(this.customerQueue);
        const agentData = this.takeFirst(this.agentQueue);
        this.customerQueue = customerData.remainingQueue
        this.agentQueue = agentData.remainingQueue
        const pairing = {
            customer: customerData.first,
            agent: agentData.first
        }
        console.log(`${LOG_PREFIX} [pairCustomerAndAgent] SUCCESS - paired:`, JSON.stringify({
            customer: pairing.customer?.username || pairing.customer?.id || 'unknown',
            agent: pairing.agent?.username || pairing.agent?.id || 'unknown'
        }));
        this.logQueueState('pairCustomerAndAgent-after');

        // If customer is an inbound phone call, add agent to Asterisk queue
        if (pairing.customer?.type === 'inbound-phone' && pairing.agent?.sipEndpoint) {
            console.log(`${LOG_PREFIX} [pairCustomerAndAgent] Inbound phone call - adding agent to Asterisk queue`);
            asteriskAMI.addAgentToAsteriskQueue(pairing.agent.sipEndpoint, 'inbound-queue')
                .then(() => console.log(`${LOG_PREFIX} Agent added to Asterisk queue`))
                .catch(err => console.error(`${LOG_PREFIX} Failed to add agent to Asterisk queue:`, err));
        }

        return pairing;
    }

    takeFirst(queueArray) {
        const queueName = queueArray === this.customerQueue ? 'customer' : 'agent';
        console.log(`${LOG_PREFIX} [takeFirst] Taking first from ${queueName} queue (length: ${queueArray.length})`);
        let first = queueArray[0]
        let remainingQueue = queueArray.slice(1)
        console.log(`${LOG_PREFIX} [takeFirst] Took:`, JSON.stringify(first?.username || first?.id || first || 'undefined'));
        return { first, remainingQueue }
    }

    emitEventToPairing(pairing) {
        console.log(`${LOG_PREFIX} [emitEventToPairing] Emitting emergencyCallConnection:`, JSON.stringify(pairing));
        io.emit('emergencyCallConnection', pairing)
        console.log(`${LOG_PREFIX} [emitEventToPairing] Event emitted successfully`);
    }


}

export default new QueueController();