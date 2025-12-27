/**
 * Device Routes
 * API endpoints for device registration and authentication
 */
import express from 'express';
import deviceController from '../controllers/device-controller.js';
import { verifyDeviceToken, verifyDeviceRefreshToken } from '../middleware/deviceAuth.js';
import { verifyAccessToken } from '../middleware/auth.js';

class DeviceRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    /**
     * Device Registration & Authentication
     * These endpoints don't require prior authentication
     */

    // POST /device/register - Register new device (no auth required)
    this.router.post('/register', deviceController.register);

    // POST /device/token - Exchange credentials for JWT (no auth required)
    this.router.post('/token', deviceController.getToken);

    // POST /device/token/refresh - Refresh access token
    this.router.post('/token/refresh', verifyDeviceRefreshToken, deviceController.refreshToken);

    /**
     * Device Management
     * These endpoints require device JWT authentication
     */

    // GET /device/:id - Get device details (device auth)
    this.router.get('/:id', verifyDeviceToken, deviceController.getDevice);

    // PUT /device/:id - Update device (device auth)
    this.router.put('/:id', verifyDeviceToken, deviceController.updateDevice);

    // POST /device/:id/link - Link device to user (device auth)
    this.router.post('/:id/link', verifyDeviceToken, deviceController.linkDevice);

    /**
     * Admin Endpoints
     * These require user JWT authentication (admin users)
     */

    // GET /device - List all devices (user auth - admin)
    this.router.get('/', verifyAccessToken, deviceController.listDevices);

    // POST /device/:id/revoke - Revoke device (user auth - admin)
    this.router.post('/:id/revoke', verifyAccessToken, deviceController.revokeDevice);
  }

  getRouter() {
    return this.router;
  }
}

export default new DeviceRoutes().getRouter();
