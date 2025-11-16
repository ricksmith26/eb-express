import { WithingsService } from '../services/WithingsService.js';
import User from '../models/User.js';
import crypto from 'crypto';

/**
 * WithingsController - Handles Withings API integration endpoints
 */
class WithingsController {
  constructor(clientId, clientSecret, callbackUrl) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl;

    // Bind methods to preserve context
    this.handleOAuthAuthorize = this.handleOAuthAuthorize.bind(this);
    this.handleOAuthCallback = this.handleOAuthCallback.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.getMeasurements = this.getMeasurements.bind(this);
    this.getActivity = this.getActivity.bind(this);
    this.getSleep = this.getSleep.bind(this);
    this.syncAllData = this.syncAllData.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.getConnectionStatus = this.getConnectionStatus.bind(this);
  }

  /**
   * GET /withings/oauth/authorize
   * Initiate OAuth flow - returns authorization URL
   * Query params: demo=true (optional) - Use demo mode with sample data
   */
  async handleOAuthAuthorize(req, res) {
    try {
      const { email } = req.user; // From JWT middleware
      const { demo, mobile } = req.query; // Check if demo mode or mobile app requested
      const useDemoMode = demo === 'true' || demo === '1';
      const isMobileApp = mobile === 'true' || mobile === '1';

      // Encode metadata directly in state parameter (base64 JSON)
      // This avoids session issues with OAuth browser redirects
      const stateData = {
        random: crypto.randomBytes(16).toString('hex'), // CSRF protection
        email,
        createdAt: Date.now(),
        demo: useDemoMode,
        mobile: isMobileApp
      };
      const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl
      });

      const authUrl = service.getAuthorizationUrl(state, useDemoMode);

      console.log(`✅ [WithingsController] Authorization URL generated for: ${email}${useDemoMode ? ' (DEMO MODE)' : ''}${isMobileApp ? ' (MOBILE APP)' : ''}`);

      res.json({
        success: true,
        authUrl,
        demo: useDemoMode,
        message: useDemoMode
          ? 'Demo mode enabled - using sample data for testing'
          : 'Redirect user to this URL to authorize Withings access'
      });
    } catch (error) {
      console.error('❌ [WithingsController] OAuth authorize failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /withings/oauth/callback
   * Handle OAuth callback from Withings
   */
  async handleOAuthCallback(req, res) {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        console.error('❌ [WithingsController] Missing code or state parameter');
        return res.redirect(`${process.env.FRONTEND_URL}/biometrics?error=missing_params`);
      }

      // Decode state parameter
      let stateData;
      try {
        const stateJson = Buffer.from(state, 'base64').toString('utf-8');
        stateData = JSON.parse(stateJson);
      } catch (error) {
        console.error('❌ [WithingsController] Invalid state parameter (decode failed)');
        return res.redirect(`${process.env.FRONTEND_URL}/biometrics?error=invalid_state`);
      }

      // Check if state is too old (10 minutes)
      const stateAge = Date.now() - stateData.createdAt;
      if (stateAge > 10 * 60 * 1000) {
        console.error('❌ [WithingsController] State parameter expired');
        const isMobileApp = stateData.mobile === true;
        if (isMobileApp) {
          return res.redirect(`brigid://biometrics?error=state_expired`);
        } else {
          return res.redirect(`${process.env.FRONTEND_URL}/biometrics?error=state_expired`);
        }
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl
      });

      // Exchange code for tokens
      const tokens = await service.exchangeCodeForToken(code);

      // Update user in database
      const user = await User.findOne({ email: stateData.email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user) {
        console.error('❌ [WithingsController] User not found:', stateData.email);
        return res.redirect(`${process.env.FRONTEND_URL}/biometrics?error=user_not_found`);
      }

      user.withingsAccessToken = tokens.accessToken;
      user.withingsRefreshToken = tokens.refreshToken;
      user.withingsTokenExpiry = new Date(Date.now() + (tokens.expiresIn * 1000));
      user.withingsUserId = tokens.userId;
      user.withingsScopes = tokens.scopes;
      user.withingsConnectedAt = new Date();
      user.withingsLastSync = null; // Will be set on first sync
      await user.save();

      console.log('✅ [WithingsController] Withings connected for:', user.email);

      // Check if request was from mobile app (from decoded state)
      const isMobileApp = stateData.mobile === true;

      if (isMobileApp) {
        // Redirect to HTML page that will trigger deep link
        console.log('📱 [WithingsController] Redirecting to mobile app via HTML redirect page');
        res.redirect(`/oauth-success.html?connected=true`);
      } else {
        // Redirect to web frontend
        console.log('🌐 [WithingsController] Redirecting to web frontend');
        res.redirect(`${process.env.FRONTEND_URL}/biometrics?connected=true`);
      }
    } catch (error) {
      console.error('❌ [WithingsController] OAuth callback failed:', error);

      // Try to decode state to check if mobile app
      let isMobileApp = false;
      try {
        const { state } = req.query;
        if (state) {
          const stateJson = Buffer.from(state, 'base64').toString('utf-8');
          const stateData = JSON.parse(stateJson);
          isMobileApp = stateData.mobile === true;
        }
      } catch (decodeError) {
        // If we can't decode state, assume web frontend
        console.error('❌ [WithingsController] Could not decode state in error handler');
      }

      if (isMobileApp) {
        res.redirect(`/oauth-success.html?error=connection_failed`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL}/biometrics?error=connection_failed`);
      }
    }
  }

  /**
   * POST /withings/oauth/refresh
   * Manually refresh access token
   */
  async refreshToken(req, res) {
    try {
      const { email } = req.user;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsRefreshToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected'
        });
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl,
        refreshToken: user.withingsRefreshToken
      });

      const tokens = await service.refreshAccessToken();

      // Update tokens in database
      user.withingsAccessToken = tokens.accessToken;
      user.withingsRefreshToken = tokens.refreshToken;
      user.withingsTokenExpiry = new Date(Date.now() + (tokens.expiresIn * 1000));
      await user.save();

      console.log('✅ [WithingsController] Token refreshed for:', email);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        expiresIn: tokens.expiresIn
      });
    } catch (error) {
      console.error('❌ [WithingsController] Token refresh failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /withings/data/measurements
   * Get body measurements (weight, BP, body composition)
   * Query params: types (comma-separated codes), startDate, endDate
   */
  async getMeasurements(req, res) {
    try {
      const { email } = req.user;
      const { types, startDate, endDate } = req.query;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsAccessToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected',
          code: 'NOT_CONNECTED'
        });
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl,
        accessToken: user.withingsAccessToken,
        refreshToken: user.withingsRefreshToken,
        tokenExpiry: user.withingsTokenExpiry
      });

      // Parse measurement types (default: weight + body composition)
      const measureTypes = types
        ? types.split(',').map(Number)
        : [1, 6, 76, 77, 88]; // Weight, Fat %, Muscle, Hydration, Bone

      const result = await service.getMeasurements(
        measureTypes,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );

      // Update token if it was refreshed
      if (service.token !== user.withingsAccessToken) {
        user.withingsAccessToken = service.token;
        user.withingsRefreshToken = service.refreshToken;
        user.withingsTokenExpiry = new Date(service.tokenExpiry);
        await user.save();
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ [WithingsController] Get measurements failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /withings/data/activity
   * Get daily activity data
   * Query params: startDate, endDate
   */
  async getActivity(req, res) {
    try {
      const { email } = req.user;
      const { startDate, endDate } = req.query;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsAccessToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected',
          code: 'NOT_CONNECTED'
        });
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl,
        accessToken: user.withingsAccessToken,
        refreshToken: user.withingsRefreshToken,
        tokenExpiry: user.withingsTokenExpiry
      });

      // Default to last 7 days if not specified
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      const activities = await service.getActivity(start, end);

      // Update token if it was refreshed
      if (service.token !== user.withingsAccessToken) {
        user.withingsAccessToken = service.token;
        user.withingsRefreshToken = service.refreshToken;
        user.withingsTokenExpiry = new Date(service.tokenExpiry);
        await user.save();
      }

      res.json({
        success: true,
        data: activities
      });
    } catch (error) {
      console.error('❌ [WithingsController] Get activity failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /withings/data/sleep
   * Get sleep data
   * Query params: startDate, endDate
   */
  async getSleep(req, res) {
    try {
      const { email } = req.user;
      const { startDate, endDate } = req.query;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsAccessToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected',
          code: 'NOT_CONNECTED'
        });
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl,
        accessToken: user.withingsAccessToken,
        refreshToken: user.withingsRefreshToken,
        tokenExpiry: user.withingsTokenExpiry
      });

      // Default to last 7 days if not specified
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      const sleepData = await service.getSleep(start, end);

      // Update token if it was refreshed
      if (service.token !== user.withingsAccessToken) {
        user.withingsAccessToken = service.token;
        user.withingsRefreshToken = service.refreshToken;
        user.withingsTokenExpiry = new Date(service.tokenExpiry);
        await user.save();
      }

      res.json({
        success: true,
        data: sleepData
      });
    } catch (error) {
      console.error('❌ [WithingsController] Get sleep failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /withings/sync
   * Manually trigger data sync (measurements, activity, sleep)
   */
  async syncAllData(req, res) {
    try {
      const { email } = req.user;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsAccessToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected',
          code: 'NOT_CONNECTED'
        });
      }

      const service = new WithingsService({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        callbackUrl: this.callbackUrl,
        accessToken: user.withingsAccessToken,
        refreshToken: user.withingsRefreshToken,
        tokenExpiry: user.withingsTokenExpiry
      });

      // Fetch last 30 days of data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      // Fetch all data types in parallel
      const [measurements, activity, sleep] = await Promise.all([
        service.getMeasurements([1, 6, 9, 10, 11, 76, 77, 88], startDate, endDate),
        service.getActivity(startDate, endDate),
        service.getSleep(startDate, endDate)
      ]);

      // Update last sync time
      user.withingsLastSync = new Date();

      // Update token if it was refreshed
      if (service.token !== user.withingsAccessToken) {
        user.withingsAccessToken = service.token;
        user.withingsRefreshToken = service.refreshToken;
        user.withingsTokenExpiry = new Date(service.tokenExpiry);
      }

      await user.save();

      console.log('✅ [WithingsController] Data synced for:', email);

      res.json({
        success: true,
        message: 'Data synced successfully',
        data: {
          measurements: measurements.measurements.length,
          activity: activity.length,
          sleep: sleep.length,
          lastSync: user.withingsLastSync
        }
      });
    } catch (error) {
      console.error('❌ [WithingsController] Sync failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /withings/disconnect
   * Disconnect Withings integration
   */
  async disconnect(req, res) {
    try {
      const { email } = req.user;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken +withingsRefreshToken');

      if (!user.withingsAccessToken) {
        return res.status(404).json({
          success: false,
          error: 'Withings not connected',
          code: 'NOT_CONNECTED'
        });
      }

      // Clear Withings data
      user.withingsAccessToken = undefined;
      user.withingsRefreshToken = undefined;
      user.withingsTokenExpiry = undefined;
      user.withingsUserId = undefined;
      user.withingsScopes = undefined;
      user.withingsConnectedAt = undefined;
      user.withingsLastSync = undefined;
      user.withingsBaseline = undefined;

      await user.save();

      console.log('✅ [WithingsController] Withings disconnected for:', email);

      res.json({
        success: true,
        message: 'Withings disconnected successfully'
      });
    } catch (error) {
      console.error('❌ [WithingsController] Disconnect failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /withings/status
   * Get connection status
   */
  async getConnectionStatus(req, res) {
    try {
      const { email } = req.user;

      const user = await User.findOne({ email })
        .select('+withingsAccessToken');

      const isConnected = !!user.withingsAccessToken;

      res.json({
        success: true,
        connected: isConnected,
        userId: user.withingsUserId || null,
        connectedAt: user.withingsConnectedAt || null,
        lastSync: user.withingsLastSync || null,
        scopes: user.withingsScopes || []
      });
    } catch (error) {
      console.error('❌ [WithingsController] Get status failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default WithingsController;
