// controllers/SpotifyController.js
import axios from 'axios';
import qs from 'qs';
import { io } from '../app.js';
import { users } from '../socketIo/socketIo.js';

export class SpotifyController {
  constructor(spotifyService, config) {
    this.spotifyService = spotifyService;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
  }

  async handleSearch(req, res) {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    try {
      const tracks = await this.spotifyService.searchTracks(query);
      res.json({ tracks });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async refreshToken(req, res) {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token' });
    }

    try {
      const tokenData = await this.spotifyService.refreshAccessToken(refresh_token);
      res.json(tokenData);
    } catch (err) {
      res.status(500).json({
        error: 'Token refresh failed',
        details: err.message,
      });
    }
  }
  async handleTokenExchange(req, res) {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const data = qs.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };

    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        data,
        { headers }
      );

      res.json(response.data); // access_token, refresh_token, expires_in
    } catch (error) {
      console.error('Token exchange failed:', error.response?.data || error.message);
      res.status(500).json({
        error: 'Token exchange failed',
        details: error.response?.data || error.message,
      });
    }
  }

  async sendSpotifyDataRequest(req, res) {
    const { toEmail, request } = req.body;
    console.log({ toEmail, request });
  
    if (!toEmail || !request) {
      return res.status(400).json({
        error: !toEmail ? 'No toEmail' : 'No request',
      });
    }
  
    try {
      const tracks = await this.spotifyService.searchTracks(request);
  
      const recipientSocketId = users.get(toEmail);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('spotify', { mode: 'spotify', tracks });
      }
  
      return res.json('ok');
    } catch (error) {
      console.error('Spotify error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch Spotify tracks' });
    }
  }
  
}
