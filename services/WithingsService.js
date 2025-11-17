import axios from 'axios';

/**
 * WithingsService - API client for Withings Health API
 * Handles OAuth authentication, token management, and data fetching
 */
export class WithingsService {
  constructor({ clientId, clientSecret, callbackUrl, accessToken, refreshToken, tokenExpiry }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl;
    this.token = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = tokenExpiry ? new Date(tokenExpiry).getTime() : null;
    this.baseUrl = 'https://wbsapi.withings.net';
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} state - CSRF protection token
   * @param {boolean} demo - Use demo mode for testing (default: false)
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state, demo = false) {
    const scopes = 'user.info,user.metrics,user.activity,user.sleepevents';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      state: state,
      scope: scopes,
      redirect_uri: this.callbackUrl
    });

    // Add demo mode parameter for testing with sample data
    if (demo) {
      params.append('mode', 'demo');
    }

    return `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param {string} code - Authorization code from callback
   * @returns {Promise<Object>} Token information
   */
  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 [WithingsService] Exchanging code for token...');

      const response = await axios.post(`${this.baseUrl}/v2/oauth2`, null, {
        params: {
          action: 'requesttoken',
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
          redirect_uri: this.callbackUrl
        }
      });

      if (response.data.status !== 0) {
        throw new Error(`Withings API error: ${response.data.status} - ${response.data.error || 'Unknown error'}`);
      }

      const { access_token, refresh_token, expires_in, userid, scope } = response.data.body;

      this.token = access_token;
      this.refreshToken = refresh_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      console.log('✅ [WithingsService] Token exchange successful');

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        userId: userid,
        scopes: scope ? scope.split(',') : []
      };
    } catch (error) {
      console.error('❌ [WithingsService] Token exchange failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @returns {Promise<Object>} New token information
   */
  async refreshAccessToken() {
    try {
      console.log('🔄 [WithingsService] Refreshing access token...');

      const response = await axios.post(`${this.baseUrl}/v2/oauth2`, null, {
        params: {
          action: 'requesttoken',
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken
        }
      });

      if (response.data.status !== 0) {
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      const { access_token, refresh_token, expires_in, userid } = response.data.body;

      this.token = access_token;
      this.refreshToken = refresh_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      console.log('✅ [WithingsService] Token refreshed successfully');

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        userId: userid
      };
    } catch (error) {
      console.error('❌ [WithingsService] Token refresh failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get valid access token (auto-refresh if expired)
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken() {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // Refresh 5 min before expiry

    if (this.token && this.tokenExpiry && (now + bufferTime) < this.tokenExpiry) {
      return this.token;
    }

    console.log('🔄 [WithingsService] Token expired or expiring soon, refreshing...');
    await this.refreshAccessToken();
    return this.token;
  }

  /**
   * Get body measurements (weight, body composition, blood pressure, etc.)
   * @param {Array<number>} measureTypes - Array of measurement type codes
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @param {number} offset - Pagination offset (optional)
   * @returns {Promise<Object>} Measurements data
   */
  async getMeasurements(measureTypes, startDate = null, endDate = null, offset = 0) {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'getmeas',
        meastypes: measureTypes.join(','),
        category: 1, // Real measurements
        offset: offset
      };

      if (startDate) params.startdate = Math.floor(new Date(startDate).getTime() / 1000);
      if (endDate) params.enddate = Math.floor(new Date(endDate).getTime() / 1000);

      const response = await axios.post(`${this.baseUrl}/measure`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('🔍 [WithingsService] Measurements API response:', {
        status: response.data.status,
        measuregrps: response.data.body?.measuregrps?.length || 0,
        more: response.data.body?.more,
        offset: response.data.body?.offset,
        timezone: response.data.body?.timezone
      });

      if (response.data.status !== 0) {
        // Handle specific error codes
        if (response.data.status === 295) {
          // Token expired, refresh and retry
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getMeasurements(measureTypes, startDate, endDate, offset);
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      // Parse and transform measurements
      const measuregrps = response.data.body.measuregrps || [];
      const measurements = measuregrps.map(group => ({
        date: new Date(group.date * 1000),
        deviceId: group.deviceid,
        measures: group.measures.map(m => ({
          type: m.type,
          value: this._parseMeasurementValue(m.value, m.unit),
          unit: this._getMeasurementUnit(m.type),
          rawValue: m.value,
          rawUnit: m.unit
        }))
      }));

      return {
        measurements,
        more: response.data.body.more === 1,
        offset: response.data.body.offset || 0,
        updateTime: response.data.body.updatetime ? new Date(response.data.body.updatetime * 1000) : null
      };
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get measurements:', error.message);
      throw error;
    }
  }

  /**
   * Get daily activity summary
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Activity data
   */
  async getActivity(startDate, endDate) {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'getactivity',
        startdateymd: this._formatDate(startDate),
        enddateymd: this._formatDate(endDate)
      };

      const response = await axios.post(`${this.baseUrl}/v2/measure`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.status !== 0) {
        if (response.data.status === 295) {
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getActivity(startDate, endDate);
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      return response.data.body.activities || [];
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get activity:', error.message);
      throw error;
    }
  }

  /**
   * Get intraday activity (heart rate, steps, etc.)
   * @param {Date} startDate - Start date/time
   * @param {Date} endDate - End date/time
   * @returns {Promise<Array>} Intraday activity data
   */
  async getIntradayActivity(startDate, endDate) {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'getintradayactivity',
        startdate: Math.floor(new Date(startDate).getTime() / 1000),
        enddate: Math.floor(new Date(endDate).getTime() / 1000)
      };

      const response = await axios.post(`${this.baseUrl}/v2/measure`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.status !== 0) {
        if (response.data.status === 295) {
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getIntradayActivity(startDate, endDate);
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      return response.data.body.series || [];
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get intraday activity:', error.message);
      throw error;
    }
  }

  /**
   * Get sleep summaries
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Promise<Array>} Sleep data
   */
  async getSleep(startDate = null, endDate = null) {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'getsummary'
      };

      if (startDate) params.startdateymd = this._formatDate(startDate);
      if (endDate) params.enddateymd = this._formatDate(endDate);

      const response = await axios.post(`${this.baseUrl}/v2/sleep`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('🔍 [WithingsService] Sleep API response:', {
        status: response.data.status,
        seriesCount: response.data.body?.series?.length || 0,
        more: response.data.body?.more,
        offset: response.data.body?.offset,
        fullBody: JSON.stringify(response.data.body)
      });

      if (response.data.status !== 0) {
        if (response.data.status === 295) {
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getSleep(startDate, endDate);
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      return response.data.body.series || [];
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get sleep:', error.message);
      throw error;
    }
  }

  /**
   * Get user's devices
   * @returns {Promise<Array>} Device information
   */
  async getDevices() {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'getdevice'
      };

      const response = await axios.post(`${this.baseUrl}/v2/user`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.status !== 0) {
        if (response.data.status === 295) {
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getDevices();
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      return response.data.body.devices || [];
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get devices:', error.message);
      throw error;
    }
  }

  /**
   * Get user profile information (email, etc.)
   * @returns {Promise<Object>} User profile
   */
  async getUserInfo() {
    try {
      const token = await this.getAccessToken();
      const params = {
        action: 'list'
      };

      const response = await axios.post(`${this.baseUrl}/v2/user`, null, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('🔍 [WithingsService] User info API response:', {
        status: response.data.status,
        body: response.data.body
      });

      if (response.data.status !== 0) {
        if (response.data.status === 295) {
          console.log('🔄 [WithingsService] Token expired (295), refreshing and retrying...');
          await this.refreshAccessToken();
          return this.getUserInfo();
        }
        throw new Error(`Withings API error: ${response.data.status}`);
      }

      const users = response.data.body.users || [];
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('❌ [WithingsService] Failed to get user info:', error.message);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Parse measurement value with unit
   * @private
   */
  _parseMeasurementValue(value, unit) {
    return value * Math.pow(10, unit);
  }

  /**
   * Get measurement unit by type code
   * @private
   */
  _getMeasurementUnit(type) {
    const units = {
      1: 'kg',      // Weight
      4: 'm',       // Height
      5: 'kg',      // Fat Free Mass
      6: '%',       // Fat Ratio
      8: 'kg',      // Fat Mass Weight
      9: 'mmHg',    // Diastolic BP
      10: 'mmHg',   // Systolic BP
      11: 'bpm',    // Heart Rate
      12: '°C',     // Temperature
      54: '%',      // SpO2
      71: '°C',     // Skin Temperature
      73: '°C',     // Body Temperature
      76: 'kg',     // Muscle Mass
      77: 'kg',     // Hydration
      88: 'kg',     // Bone Mass
      91: 'm/s',    // Pulse Wave Velocity
      123: 'ml/min/kg', // VO2 Max
      135: 'ms',    // QRS interval duration (ECG)
      136: 'ms',    // PR interval duration (ECG)
      137: 'ms',    // QT interval duration (ECG)
      138: 'ms',    // Corrected QT interval (ECG)
      139: ''       // Atrial fibrillation result from PPG (no unit)
    };
    return units[type] || '';
  }

  /**
   * Format date to YYYY-MM-DD
   * @private
   */
  _formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
