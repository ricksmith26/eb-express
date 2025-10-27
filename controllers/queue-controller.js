// import axios from 'axios';
// import qs from 'qs';
import { io } from '../app.js';
// import { users } from '../socketIo/socketIo.js';

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
    }

    async addCustomerToQueue(customer) {
        try {
            this.customerQueue.push(customer)
            if (this.agentQueue.length > 0) {
                const data = this.pairCustomerAndAgent()
                io.emit('emergencyCallConnection', data)
                return (data)
            }
            console.log(this.customerQueue)
            return res.json('Waiting in queue')
        } catch (error) {

        }
    }
    async addAgentToQueue(agent) {
        try {
            this.agentQueue.push(agent)
            console.log(this.agentQueue)
            if (this.customerQueue.length > 0) {
                const data = this.pairCustomerAndAgent()
                io.emit('emergencyCallConnection', data)
                return ({ customer: data.customer, agent: data.agent })
            }
            return ('ok')
        } catch (error) {
            console.log(error)
            return (error)
        }
    }

    removeByUsername = (array, username) => {
        return array.filter(item => item.username !== username);
    };


    removeAgentFromQueue(username) {
        const adjustedQueue = this.removeByUsername(this.agentQueue, username)
        this.agentQueue = adjustedQueue
        console.log(this.agentQueue)
    }

    pairCustomerAndAgent() {
        const customerData = this.takeFirst(this.customerQueue);
        const agentData = this.takeFirst(this.agentQueue);
        this.customerQueue = customerData.remainingQueue
        this.agentQueue = agentData.remainingQueue
        return {
            customer: customerData.first,
            agent: agentData.first
        }
    }

    takeFirst(queueArray) {
        console.log(queueArray)
        let first = queueArray[0]
        let remainingQueue = queueArray.slice(1)
        console.log({ first, remainingQueue }, '??')
        return { first, remainingQueue }
    }

    emitEventToPairing(pairing) {
        console.log('emitEventToPairing>>:', emitEventToPairing)
        io.emit('emergencyCallConnection', pairing)
    }


}

export default new QueueController();