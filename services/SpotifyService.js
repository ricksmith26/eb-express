// services/SpotifyService.js
import axios from 'axios';
import qs from 'qs';


export class SpotifyService {
  constructor({
    clientId,
    clientSecret,
    userToken,
    refreshToken,
    redirectUri,
    onTokenRefresh, // optional callback to persist new access token
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.token = userToken;
    this.refreshToken = refreshToken;
    this.redirectUri = redirectUri;
    this.tokenExpires = null;
    this.onTokenRefresh = onTokenRefresh;
  }

  async getServiceAccessToken() {
    const now = Date.now();
    if (this.token && this.tokenExpires && now < this.tokenExpires) {
      return this.token;
    }

    const tokenUrl = 'https://accounts.spotify.com/api/token';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };

    const data = qs.stringify({ grant_type: 'client_credentials' });

    try {
      const response = await axios.post(tokenUrl, data, { headers });
      this.token = response.data.access_token;
      this.tokenExpires = now + (response.data.expires_in || 3600) * 1000;
      return this.token;
    } catch (error) {
      console.error('❌ Error getting client access token:', error.response?.data || error.message);
      throw new Error('Failed to get Spotify access token');
    }
  }


  async getAccessToken() {
    const now = Date.now();
    if (this.token && this.tokenExpires && now < this.tokenExpires) {
      return this.token;
    }

    if (this.refreshToken) {
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
      };

      const data = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      });

      try {
        const response = await axios.post(tokenUrl, data, { headers });

        this.token = response.data.access_token;
        this.tokenExpires = now + (response.data.expires_in || 3600) * 1000;

        if (this.onTokenRefresh) {
          this.onTokenRefresh(this.token);
        }

        return this.token;
      } catch (error) {
        console.error('Error refreshing Spotify token:', error.response?.data || error.message);
        throw new Error('Failed to refresh Spotify access token');
      }
    }

    throw new Error('No valid access or refresh token available.');
  }

  async refreshAccessToken(refreshToken) {
    const data = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };

    console.log('🔁 Refreshing token with', { refreshToken });

    try {
      console.log('🧪 Base64 encoded header:',
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'));
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        data,
        { headers }
      );

      console.log('✅ Token refresh success');
      return response.data;
    } catch (error) {
      console.error('❌ Spotify refresh error:', error.response?.data || error.message);
      throw new Error('Spotify token refresh failed');
    }
  }
  async searchTracks(query, limit = 10) {
    const token = await this.getServiceAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const searchUrl = 'https://api.spotify.com/v1/search';
    const params = { q: query, type: 'track', limit };

    try {
      const res = await axios.get(searchUrl, { headers, params });
      const tracks = res.data.tracks?.items.map(track => ({
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        uri: track.uri,
        id: track.id,
        preview_url: track.preview_url,
        album: {
          name: track.album.name,
          image: track.album.images?.[0]?.url || null,
        },
      })) || [];

      return tracks;
    } catch (error) {
      console.error('❌ Spotify search error:', error.response?.data || error.message);
      throw new Error('Failed to search Spotify tracks');
    }
  }
  
}
