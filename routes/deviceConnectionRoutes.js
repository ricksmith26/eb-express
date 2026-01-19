/**
 * Device Connection Routes
 * API endpoints for device connection status and history
 */
import express from 'express';
import deviceConnectionController from '../controllers/device-connection-controller.js';
import { verifyAccessToken } from '../middleware/auth.js';

class DeviceConnectionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // All routes require authentication
    this.router.use(verifyAccessToken);

    // GET /device-connections - List all device connections
    this.router.get('/', deviceConnectionController.list);

    // GET /device-connections/online - List online devices
    this.router.get('/online', deviceConnectionController.listOnline);

    // GET /device-connections/status - Get status summary for dashboard
    this.router.get('/status', deviceConnectionController.getStatusSummary);

    // GET /device-connections/history - Get connection event history
    this.router.get('/history', deviceConnectionController.getHistory);

    // GET /device-connections/history/:email - Get user's connection history
    this.router.get('/history/:email', deviceConnectionController.getUserHistory);

    // GET /device-connections/user/:email - Get user's device connections
    this.router.get('/user/:email', deviceConnectionController.getUserConnections);

    // GET /device-connections/agent/:username - Get agent's connection status
    this.router.get('/agent/:username', deviceConnectionController.getAgentConnection);

    // GET /device-connections/:id - Get specific connection by ID
    this.router.get('/:id', deviceConnectionController.getById);
  }

  getRouter() {
    return this.router;
  }
}

export default new DeviceConnectionRoutes().getRouter();
