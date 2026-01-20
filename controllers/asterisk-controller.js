import { AsteriskCredential } from '../models/Asterisk.js';
import { Agents } from '../socketIo/socketIo.js';
import { io } from '../app.js'
import QueueController from './queue-controller.js';

class AsteriskController {
  constructor() {
    this.queueController = QueueController
    this.addAddAsteriskCredentials = this.addAddAsteriskCredentials.bind(this);
    this.getInactiveAgent = this.getInactiveAgent.bind(this);
    this.getInactiveCustomer = this.getInactiveCustomer.bind(this);
    this.getActiveAgentAndInactiveCustomer = this.getActiveAgentAndInactiveCustomer.bind(this);
    this.setAgentStatus = this.setAgentStatus.bind(this);
    this.updateAgentStatus = this.updateAgentStatus.bind(this);
    this.getAllAgents = this.getAllAgents.bind(this);
  }

  async addAddAsteriskCredentials(req, res) {
    try {
      const credentials = req.body;
      const newCredential = new AsteriskCredential(credentials);
      await newCredential.save();
      return res.json(newCredential);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add Asterisk credentials' });
    }
  }

  async getAllAgents(req, res) {
    try {
      const credentials = await AsteriskCredential.find({ type: 'agent' }).sort({ username: 1 });
      if (!credentials) return res.status(404).json({ message: 'No inactive agent found' });
      // console.,
      res.json(credentials);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to get inactive agent' });
    }
  }

  async getInactiveAgent(req, res) {
    try {
      const credential = await AsteriskCredential.findOne({ type: 'agent', status: 'INACTIVE' })
      if (!credential) return res.status(404).json({ message: 'No inactive agent found' });
      res.json(credential);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to get inactive agent' });
    }
  }

  async getInactiveCustomer(req, res) {
    console.log('hit')
    try {
      const { email, deviceId } = req.query;
      const credential = await AsteriskCredential.findOne({ type: 'customer', status: 'INACTIVE' })
      if (!credential) return res.status(404).json({ message: 'No inactive customer found' });

      // Create customer object with email and deviceId if provided
      // Set type to 'sip' so frontend knows this is a SIP call (not phone)
      const customerData = {
        ...credential.toObject(),
        type: 'sip',  // Override type for frontend to identify as SIP call
        callerEmail: email || null,  // Store the caller's email for patient lookup
        deviceId: deviceId || null  // Store device ID for video routing
      };

      this.queueController.addCustomerToQueue(customerData)
      res.json(credential);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to get inactive customer' });
    }
  }

  async getActiveAgentAndInactiveCustomer(req, res) {
    try {
      const activeAgent = await AsteriskCredential.findOne({ type: 'agent', status: 'INACTIVE' });
      const inactiveCustomer = await AsteriskCredential.findOne({ type: 'customer', status: 'INACTIVE' });

      if (!activeAgent && !inactiveCustomer) {
        return res.status(404).json({ error: 'No active agent and no inactive customer found' });
      }

      if (!activeAgent) {
        return res.status(404).json({ error: 'No active agent found' });
      }

      if (!inactiveCustomer) {
        return res.status(404).json({ error: 'No inactive customer found' });
      }

      activeAgent.active = false;
      inactiveCustomer.active = true;

      await Promise.all([
        activeAgent.save(),
        inactiveCustomer.save()
      ]);

      res.json({
        activeAgent,
        inactiveCustomer,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to swap active agent and inactive customer' });
    }
  }

  async setAgentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const result = await this.updateAgentStatus(id, status);
      res.json(result);
    } catch (error) {
      console.error('setAgentStatus error:', error);
      res.status(500).json({ error: error.message || 'Failed to update agent status' });
    }
  }

  async updateAgentStatus(id, status) {
    try {
      const agent = await AsteriskCredential.findById(id);
      if (!agent) {
        throw new Error('Agent not found');
      }
      agent.status = status;
      await agent.save();
      console.log('UPDATING STATUS:', status);
      if (status === 'AVAILABLE') {
        console.log('PUSHING TO QUEUE', status);
        this.queueController.addAgentToQueue(agent);
      } else {
        this.queueController.removeAgentFromQueue(agent.username);
      }
      io.emit('agentStatusChange', { username: agent.username, status });
      return { message: `Agent set to ${status}`, agent };
    } catch (error) {
      console.error('updateAgentStatus error:', error);
      throw error;
    }
  }
}

export default new AsteriskController();