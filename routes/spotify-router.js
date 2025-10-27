// routes/SpotifyRouter.js
import express from 'express';
import { SpotifyController } from '../controllers/spotify-controller.js';
import { SpotifyService } from '../services/SpotifyService.js';

export class SpotifyRouter {
  constructor(clientId, clientSecret, redirectUri) {
    this.router = express.Router();
    const spotifyService = new SpotifyService({
      clientId,
      clientSecret,
      redirectUri,        
      userToken: null,    
      refreshToken: null, 
    });
    
    this.controller = new SpotifyController(spotifyService, {
      clientId,
      clientSecret,
      redirectUri,
    });

    this.registerRoutes();
  }

  registerRoutes() {
    this.router.post('/search', this.controller.handleSearch.bind(this.controller));
    this.router.post('/token', this.controller.handleTokenExchange.bind(this.controller));
    this.router.post('/refresh', this.controller.refreshToken.bind(this.controller));
    this.router.post('/requestMusic', this.controller.sendSpotifyDataRequest.bind(this.controller));
  }

  getRouter() {
    return this.router;
  }
}
