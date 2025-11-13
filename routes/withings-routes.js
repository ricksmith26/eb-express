import express from 'express';
import WithingsController from '../controllers/withings-controller.js';
import { verifyAccessToken } from '../middleware/auth.js';
import {
  WITHINGS_CLIENT_ID,
  WITHINGS_CLIENT_SECRET,
  WITHINGS_CALLBACK_URL
} from '../config/vars.js';

/**
 * WithingsRoutes - Defines all Withings API routes
 */
class WithingsRoutes {
  constructor() {
    this.router = express.Router();
    this.controller = new WithingsController(
      WITHINGS_CLIENT_ID,
      WITHINGS_CLIENT_SECRET,
      WITHINGS_CALLBACK_URL
    );
    this.initializeRoutes();
  }

  initializeRoutes() {
    // OAuth endpoints
    // GET /withings/oauth/authorize - Initiate OAuth flow (requires JWT auth)
    this.router.get(
      '/oauth/authorize',
      verifyAccessToken,
      this.controller.handleOAuthAuthorize
    );

    // GET /withings/oauth/callback - OAuth callback from Withings (no auth required)
    this.router.get(
      '/oauth/callback',
      this.controller.handleOAuthCallback
    );

    // POST /withings/oauth/refresh - Manually refresh token (requires JWT auth)
    this.router.post(
      '/oauth/refresh',
      verifyAccessToken,
      this.controller.refreshToken
    );

    // Connection status
    // GET /withings/status - Get connection status (requires JWT auth)
    this.router.get(
      '/status',
      verifyAccessToken,
      this.controller.getConnectionStatus
    );

    // Data endpoints (all require JWT authentication)
    // GET /withings/data/measurements - Get body measurements
    this.router.get(
      '/data/measurements',
      verifyAccessToken,
      this.controller.getMeasurements
    );

    // GET /withings/data/activity - Get activity data
    this.router.get(
      '/data/activity',
      verifyAccessToken,
      this.controller.getActivity
    );

    // GET /withings/data/sleep - Get sleep data
    this.router.get(
      '/data/sleep',
      verifyAccessToken,
      this.controller.getSleep
    );

    // Sync & disconnect
    // POST /withings/sync - Manually trigger data sync
    this.router.post(
      '/sync',
      verifyAccessToken,
      this.controller.syncAllData
    );

    // POST /withings/disconnect - Disconnect Withings integration
    this.router.post(
      '/disconnect',
      verifyAccessToken,
      this.controller.disconnect
    );
  }

  getRouter() {
    return this.router;
  }
}

export default new WithingsRoutes().getRouter();
