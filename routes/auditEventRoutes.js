/**
 * AuditEvent Routes
 * API endpoints for audit event submission and retrieval
 */
import express from 'express';
import auditEventController from '../controllers/auditEvent-controller.js';
import { verifyDeviceToken, optionalDeviceAuth } from '../middleware/deviceAuth.js';
import { verifyAccessToken } from '../middleware/auth.js';

class AuditEventRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    /**
     * Device endpoints - require device JWT
     */

    // POST /auditEvent - Submit single event
    this.router.post('/', optionalDeviceAuth, auditEventController.createEvent);

    // POST /auditEvent/batch - Submit multiple events
    this.router.post('/batch', optionalDeviceAuth, auditEventController.createBatch);

    /**
     * Admin/Read endpoints - require user JWT
     */

    // GET /auditEvent/stats - Overall statistics
    this.router.get('/stats', verifyAccessToken, auditEventController.getStats);

    // GET /auditEvent/alerts - Security alerts
    this.router.get('/alerts', verifyAccessToken, auditEventController.getAlerts);

    // GET /auditEvent/device/:deviceId - Events for a device
    this.router.get('/device/:deviceId', verifyAccessToken, auditEventController.getDeviceEvents);

    // GET /auditEvent/device/:deviceId/summary - Device summary
    this.router.get('/device/:deviceId/summary', verifyAccessToken, auditEventController.getDeviceSummary);

    // GET /auditEvent/:id - Single event
    this.router.get('/:id', verifyAccessToken, auditEventController.getEvent);
  }

  getRouter() {
    return this.router;
  }
}

export default new AuditEventRoutes().getRouter();
