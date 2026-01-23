/**
 * Observation Routes
 * API endpoints for FHIR Observation submission and retrieval
 */
import express from 'express';
import observationController from '../controllers/observation-controller.js';
import { optionalDeviceAuth } from '../middleware/deviceAuth.js';
import { verifyAccessToken } from '../middleware/auth.js';

class ObservationRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    /**
     * Device endpoints - require device JWT (or optional for Pi devices)
     */

    // POST /observation - Submit single observation (e.g., wellness check)
    this.router.post('/', optionalDeviceAuth, observationController.createObservation);

    /**
     * Admin/Read endpoints - require user JWT
     */

    // GET /observation/stats - Overall statistics
    this.router.get('/stats', verifyAccessToken, observationController.getStats);

    // GET /observation/patient/:patientId - All observations for a patient
    this.router.get('/patient/:patientId', verifyAccessToken, observationController.getPatientObservations);

    // GET /observation/patient/:patientId/wellness - Wellness checks for a patient
    this.router.get('/patient/:patientId/wellness', verifyAccessToken, observationController.getPatientWellnessChecks);

    // GET /observation/patient/:patientId/wellness/summary - Wellness summary for a patient
    this.router.get('/patient/:patientId/wellness/summary', verifyAccessToken, observationController.getPatientWellnessSummary);

    // GET /observation/device/:deviceId - Observations from a device
    this.router.get('/device/:deviceId', verifyAccessToken, observationController.getDeviceObservations);

    // GET /observation/:id - Single observation
    this.router.get('/:id', verifyAccessToken, observationController.getObservation);
  }

  getRouter() {
    return this.router;
  }
}

export default new ObservationRoutes().getRouter();
