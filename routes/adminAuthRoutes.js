/**
 * Admin Auth Routes
 * Authentication and profile management for the admin portal
 */
import express from 'express';
import adminAuthController from '../controllers/admin-auth-controller.js';
import { verifyCognitoToken, requirePractitioner } from '../middleware/cognitoAuth.js';

class AdminAuthRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    /**
     * Registration
     * Called after user completes Cognito signup
     */

    // POST /admin/auth/register - Register new practitioner
    this.router.post('/register', verifyCognitoToken, adminAuthController.register);

    /**
     * Profile Management
     * Require authenticated practitioner
     */

    // GET /admin/auth/me - Get current user profile
    this.router.get('/me', verifyCognitoToken, requirePractitioner, adminAuthController.getMe);

    // PUT /admin/auth/me - Update profile
    this.router.put('/me', verifyCognitoToken, requirePractitioner, adminAuthController.updateProfile);

    /**
     * Organization Context
     */

    // POST /admin/auth/switch-org - Switch active organization
    this.router.post('/switch-org', verifyCognitoToken, requirePractitioner, adminAuthController.switchOrganization);

    // GET /admin/auth/my-organizations - Get user's organizations
    this.router.get('/my-organizations', verifyCognitoToken, requirePractitioner, adminAuthController.getMyOrganizations);
  }

  getRouter() {
    return this.router;
  }
}

export default new AdminAuthRoutes().getRouter();
