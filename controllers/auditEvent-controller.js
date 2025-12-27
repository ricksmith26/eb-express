/**
 * AuditEvent Controller
 * Handles audit event submission and retrieval
 */
import { v4 as uuidv4 } from 'uuid';
import FhirAuditEvent from '../models/FhirAuditEvent.js';

class AuditEventController {

  /**
   * POST /auditEvent
   * Submit a single audit event
   */
  async createEvent(req, res) {
    try {
      const eventData = req.body;

      // Add server-side metadata
      const event = new FhirAuditEvent({
        ...eventData,
        _brigid: {
          ...eventData._brigid,
          receivedAt: new Date()
        }
      });

      // Extract deviceId for quick lookup
      if (eventData.source?.observer?.identifier) {
        event.source.observer.deviceId = eventData.source.observer.identifier;
      }

      await event.save();

      console.log(`📋 Audit event: ${eventData.subtype?.[0]?.code || 'unknown'} from ${event.source?.observer?.deviceId || 'unknown'}`);

      res.status(201).json({
        success: true,
        id: event.id
      });

    } catch (error) {
      console.error('🚨 Create audit event error:', error);
      res.status(500).json({
        error: 'Failed to create audit event',
        code: 'CREATE_ERROR'
      });
    }
  }

  /**
   * POST /auditEvent/batch
   * Submit multiple audit events at once
   */
  async createBatch(req, res) {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({
          error: 'Events array required',
          code: 'INVALID_REQUEST'
        });
      }

      const batchId = uuidv4();
      const receivedAt = new Date();

      // Process events
      const documents = events.map(eventData => {
        const doc = {
          ...eventData,
          _brigid: {
            ...eventData._brigid,
            receivedAt,
            batchId
          }
        };

        // Extract deviceId for quick lookup
        if (eventData.source?.observer?.identifier) {
          if (!doc.source) doc.source = {};
          if (!doc.source.observer) doc.source.observer = {};
          doc.source.observer.deviceId = eventData.source.observer.identifier;
        }

        return doc;
      });

      // Bulk insert
      const result = await FhirAuditEvent.insertMany(documents, { ordered: false });

      console.log(`📋 Batch audit: ${result.length} events from ${documents[0]?.source?.observer?.deviceId || 'unknown'}`);

      res.json({
        success: true,
        inserted: result.length,
        batchId
      });

    } catch (error) {
      // Handle partial failures in bulk insert
      if (error.insertedDocs) {
        console.log(`📋 Partial batch: ${error.insertedDocs.length} of ${error.writeErrors?.length + error.insertedDocs.length} events`);
        return res.json({
          success: true,
          inserted: error.insertedDocs.length,
          failed: error.writeErrors?.length || 0
        });
      }

      console.error('🚨 Batch audit event error:', error);
      res.status(500).json({
        error: 'Failed to create audit events',
        code: 'BATCH_ERROR'
      });
    }
  }

  /**
   * GET /auditEvent/device/:deviceId
   * Get audit events for a specific device
   */
  async getDeviceEvents(req, res) {
    try {
      const { deviceId } = req.params;
      const { limit = 100, offset = 0, eventType, outcome, startDate, endDate } = req.query;

      const events = await FhirAuditEvent.findByDevice(deviceId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        eventType,
        outcome,
        startDate,
        endDate
      });

      const total = await FhirAuditEvent.countDocuments({
        'source.observer.deviceId': deviceId
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: events.map(event => ({
          resource: event
        }))
      });

    } catch (error) {
      console.error('🚨 Get device events error:', error);
      res.status(500).json({
        error: 'Failed to get audit events',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /auditEvent/device/:deviceId/summary
   * Get audit event summary for a device
   */
  async getDeviceSummary(req, res) {
    try {
      const { deviceId } = req.params;
      const { days = 7 } = req.query;

      const summary = await FhirAuditEvent.getDeviceSummary(deviceId, parseInt(days));

      res.json({
        deviceId,
        period: {
          days: parseInt(days),
          from: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString()
        },
        events: summary
      });

    } catch (error) {
      console.error('🚨 Get device summary error:', error);
      res.status(500).json({
        error: 'Failed to get summary',
        code: 'SUMMARY_ERROR'
      });
    }
  }

  /**
   * GET /auditEvent/alerts
   * Get security alerts across all devices
   */
  async getAlerts(req, res) {
    try {
      const { limit = 50, deviceId, since } = req.query;

      const alerts = await FhirAuditEvent.getSecurityAlerts({
        limit: parseInt(limit),
        deviceId,
        since
      });

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total: alerts.length,
        entry: alerts.map(alert => ({
          resource: alert
        }))
      });

    } catch (error) {
      console.error('🚨 Get alerts error:', error);
      res.status(500).json({
        error: 'Failed to get alerts',
        code: 'ALERTS_ERROR'
      });
    }
  }

  /**
   * GET /auditEvent/:id
   * Get a specific audit event
   */
  async getEvent(req, res) {
    try {
      const { id } = req.params;

      const event = await FhirAuditEvent.findOne({ id });

      if (!event) {
        return res.status(404).json({
          error: 'Audit event not found',
          code: 'NOT_FOUND'
        });
      }

      res.json(event);

    } catch (error) {
      console.error('🚨 Get event error:', error);
      res.status(500).json({
        error: 'Failed to get audit event',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * GET /auditEvent/stats
   * Get overall audit statistics
   */
  async getStats(req, res) {
    try {
      const { days = 7 } = req.query;
      const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

      const stats = await FhirAuditEvent.aggregate([
        { $match: { recorded: { $gte: since } } },
        {
          $facet: {
            byOutcome: [
              { $group: { _id: '$outcome', count: { $sum: 1 } } }
            ],
            byType: [
              { $group: { _id: '$type.code', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            byDevice: [
              { $group: { _id: '$source.observer.deviceId', count: { $sum: 1 } } },
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
        byOutcome: result.byOutcome || [],
        byType: result.byType || [],
        byDevice: result.byDevice || []
      });

    } catch (error) {
      console.error('🚨 Get stats error:', error);
      res.status(500).json({
        error: 'Failed to get stats',
        code: 'STATS_ERROR'
      });
    }
  }
}

export default new AuditEventController();
