/**
 * Observation Controller
 * Handles FHIR Observation submission and retrieval (including wellness checks)
 */
import FhirObservation from '../models/FhirObservation.js';

class ObservationController {

  /**
   * POST /observation
   * Submit a single observation (e.g., wellness check)
   */
  async createObservation(req, res) {
    try {
      const observationData = req.body;

      // Validate resourceType
      if (observationData.resourceType && observationData.resourceType !== 'Observation') {
        return res.status(400).json({
          error: 'Invalid resourceType',
          code: 'INVALID_RESOURCE_TYPE'
        });
      }

      // Extract patient ID from subject reference
      let patientId = null;
      if (observationData.subject?.reference) {
        const match = observationData.subject.reference.match(/Patient\/(.+)/);
        if (match) {
          patientId = match[1];
        }
      }

      // Extract device ID from performer
      let deviceId = null;
      if (observationData.performer?.[0]?.identifier?.value) {
        deviceId = observationData.performer[0].identifier.value;
      }

      // Create observation with server-side metadata
      const observation = new FhirObservation({
        ...observationData,
        _brigid: {
          patientId,
          deviceId,
          receivedAt: new Date()
        }
      });

      await observation.save();

      const codeDisplay = observationData.code?.coding?.[0]?.code || 'observation';
      const statusValue = observationData.valueCodeableConcept?.coding?.[0]?.code || '';
      console.log(`🩺 Observation: ${codeDisplay} (${statusValue}) for patient ${patientId || 'unknown'}`);

      res.status(201).json({
        success: true,
        id: observation.id,
        resourceType: 'Observation'
      });

    } catch (error) {
      console.error('🚨 Create observation error:', error);
      res.status(500).json({
        error: 'Failed to create observation',
        code: 'CREATE_ERROR'
      });
    }
  }

  /**
   * GET /observation/:id
   * Get a specific observation
   */
  async getObservation(req, res) {
    try {
      const { id } = req.params;

      const observation = await FhirObservation.findOne({ id });

      if (!observation) {
        return res.status(404).json({
          error: 'Observation not found',
          code: 'NOT_FOUND'
        });
      }

      res.json(observation);

    } catch (error) {
      console.error('🚨 Get observation error:', error);
      res.status(500).json({
        error: 'Failed to get observation',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /observation/patient/:patientId
   * Get observations for a specific patient
   */
  async getPatientObservations(req, res) {
    try {
      const { patientId } = req.params;
      const { limit = 100, offset = 0, code, startDate, endDate } = req.query;

      const observations = await FhirObservation.findByPatient(patientId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        code,
        startDate,
        endDate
      });

      const total = await FhirObservation.countDocuments({
        $or: [
          { '_brigid.patientId': patientId },
          { 'subject.reference': `Patient/${patientId}` }
        ]
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: observations.map(obs => ({
          resource: obs
        }))
      });

    } catch (error) {
      console.error('🚨 Get patient observations error:', error);
      res.status(500).json({
        error: 'Failed to get observations',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /observation/patient/:patientId/wellness
   * Get wellness checks for a specific patient
   */
  async getPatientWellnessChecks(req, res) {
    try {
      const { patientId } = req.params;
      const { limit = 100, offset = 0, startDate, endDate } = req.query;

      const observations = await FhirObservation.findWellnessChecks(patientId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate,
        endDate
      });

      const total = await FhirObservation.countDocuments({
        $or: [
          { '_brigid.patientId': patientId },
          { 'subject.reference': `Patient/${patientId}` }
        ],
        'code.coding.code': 'wellness-check'
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: observations.map(obs => ({
          resource: obs
        }))
      });

    } catch (error) {
      console.error('🚨 Get wellness checks error:', error);
      res.status(500).json({
        error: 'Failed to get wellness checks',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /observation/patient/:patientId/wellness/summary
   * Get wellness check summary for a patient
   */
  async getPatientWellnessSummary(req, res) {
    try {
      const { patientId } = req.params;
      const { days = 30 } = req.query;

      const summary = await FhirObservation.getWellnessSummary(patientId, parseInt(days));

      // Get most recent wellness check
      const latest = await FhirObservation.findOne({
        $or: [
          { '_brigid.patientId': patientId },
          { 'subject.reference': `Patient/${patientId}` }
        ],
        'code.coding.code': 'wellness-check'
      }).sort({ effectiveDateTime: -1 });

      res.json({
        patientId,
        period: {
          days: parseInt(days),
          from: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString()
        },
        statusBreakdown: summary,
        latestCheck: latest ? {
          id: latest.id,
          status: latest.valueCodeableConcept?.coding?.[0]?.code,
          date: latest.effectiveDateTime
        } : null
      });

    } catch (error) {
      console.error('🚨 Get wellness summary error:', error);
      res.status(500).json({
        error: 'Failed to get wellness summary',
        code: 'SUMMARY_ERROR'
      });
    }
  }

  /**
   * GET /observation/device/:deviceId
   * Get observations from a specific device
   */
  async getDeviceObservations(req, res) {
    try {
      const { deviceId } = req.params;
      const { limit = 100, offset = 0, code, startDate, endDate } = req.query;

      const observations = await FhirObservation.findByDevice(deviceId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        code,
        startDate,
        endDate
      });

      const total = await FhirObservation.countDocuments({
        '_brigid.deviceId': deviceId
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: observations.map(obs => ({
          resource: obs
        }))
      });

    } catch (error) {
      console.error('🚨 Get device observations error:', error);
      res.status(500).json({
        error: 'Failed to get observations',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /observation/stats
   * Get observation statistics
   */
  async getStats(req, res) {
    try {
      const { days = 30 } = req.query;
      const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

      const stats = await FhirObservation.aggregate([
        { $match: { effectiveDateTime: { $gte: since } } },
        {
          $facet: {
            byCode: [
              { $group: { _id: { $arrayElemAt: ['$code.coding.code', 0] }, count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            byStatus: [
              {
                $match: { 'code.coding.code': 'wellness-check' }
              },
              {
                $group: {
                  _id: { $arrayElemAt: ['$valueCodeableConcept.coding.code', 0] },
                  count: { $sum: 1 }
                }
              }
            ],
            byDevice: [
              { $group: { _id: '$_brigid.deviceId', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            total: [
              { $count: 'count' }
            ]
          }
        }
      ]);

      const result = stats[0] || {};

      res.json({
        period: {
          days: parseInt(days),
          from: since.toISOString(),
          to: new Date().toISOString()
        },
        total: result.total?.[0]?.count || 0,
        byCode: result.byCode || [],
        wellnessStatusBreakdown: result.byStatus || [],
        byDevice: result.byDevice || []
      });

    } catch (error) {
      console.error('🚨 Get observation stats error:', error);
      res.status(500).json({
        error: 'Failed to get stats',
        code: 'STATS_ERROR'
      });
    }
  }
}

export default new ObservationController();
