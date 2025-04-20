import { AsteriskCredential } from '../models/Asterisk.js';

class AsteriskController {
  constructor() {
    this.addAddAsteriskCredentials = this.addAddAsteriskCredentials.bind(this);
    this.getInactiveAgent = this.getInactiveAgent.bind(this);
    this.getActiveAgentAndInactiveCustomer = this.getActiveAgentAndInactiveCustomer.bind(this);
    this.setAgentInactive = this.setAgentInactive.bind(this);
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

  async getInactiveAgent(req, res) {
    try {
      const credential = await AsteriskCredential.findOne({ type: 'agent', active: false }).populate('agent');
      if (!credential) return res.status(404).json({ message: 'No inactive agent found' });
      res.json(credential);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to get inactive agent' });
    }
  }

  async getActiveAgentAndInactiveCustomer(req, res) {
    try {
      const activeAgent = await AsteriskCredential.findOne({ type: 'agent', active: true });
      const inactiveCustomer = await AsteriskCredential.findOne({ type: 'customer', active: false });
  
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
  async setAgentInactive(req, res) {
    try {
      const { id } = req.params;
  
      const agent = await AsteriskCredential.findOne({ _id: id, type: 'agent' });
  
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
  
      agent.active = false;
      await agent.save();
  
      res.json({ message: 'Agent set to inactive', agent });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to set agent as inactive' });
    }
  }
}

export default new AsteriskController();