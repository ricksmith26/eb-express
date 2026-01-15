/**
 * Admin Device Controller
 * Handles device management for the admin portal
 */
import FhirDevice from '../models/FhirDevice.js';
import Patient from '../models/PatientSchema.js';

class AdminDeviceController {

  /**
   * GET /admin/devices
   * List devices in the current organization
   */
  async list(req, res) {
    try {
      const { organizationId, practitionerRole } = req;
      const { search, status, assigned, limit = 50, offset = 0 } = req.query;

      // Check if super admin (can see all devices)
      const isSuperAdmin = practitionerRole?.isSuperAdmin?.();

      // Build query
      const query = {};

      if (!isSuperAdmin) {
        // Filter by org ownership or patient ownership within org
        query.$or = [
          { 'owner.reference': `Organization/${organizationId}` },
          { 'owner.reference': { $regex: `^Patient/` } } // Will filter further
        ];
      }

      if (status) {
        query.status = status;
      }

      if (search) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { 'deviceName.name': { $regex: search, $options: 'i' } },
            { 'identifier.value': { $regex: search, $options: 'i' } }
          ]
        });
      }

      let devices = await FhirDevice.find(query)
        .sort({ lastSeenAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .select('-certificate -jwtRefreshToken');

      // If not super admin, filter devices assigned to patients in this org
      if (!isSuperAdmin) {
        const orgPatients = await Patient.find({
          'managingOrganization.reference': `Organization/${organizationId}`
        }).select('id');
        const patientIds = orgPatients.map(p => `Patient/${p.id}`);

        devices = devices.filter(d => {
          const ownerRef = d.owner?.reference;
          if (!ownerRef) return true; // Unassigned devices
          if (ownerRef === `Organization/${organizationId}`) return true;
          if (patientIds.includes(ownerRef)) return true;
          return false;
        });
      }

      // Filter by assigned status
      if (assigned !== undefined) {
        const isAssigned = assigned === 'true';
        devices = devices.filter(d => {
          const hasPatientOwner = d.owner?.reference?.startsWith('Patient/');
          return isAssigned ? hasPatientOwner : !hasPatientOwner;
        });
      }

      const total = devices.length;

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: devices.map(d => ({
          resource: {
            resourceType: d.resourceType,
            id: d.id,
            device_id: d.getDeviceId(),
            identifier: d.identifier,
            status: d.status,
            deviceName: d.deviceName,
            type: d.type,
            owner: d.owner,
            registeredAt: d.registeredAt,
            lastSeenAt: d.lastSeenAt,
            deviceInfo: d.deviceInfo,
            needsRenewal: d.needsCertRenewal()
          }
        }))
      });

    } catch (error) {
      console.error('List devices error:', error);
      res.status(500).json({
        error: 'Failed to list devices',
        code: 'LIST_ERROR'
      });
    }
  }

  /**
   * GET /admin/devices/:id
   * Get device details
   */
  async get(req, res) {
    try {
      const { id } = req.params;

      const device = await FhirDevice.findOne({ id })
        .select('-certificate -jwtRefreshToken');

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'NOT_FOUND'
        });
      }

      // Get patient info if assigned
      let patient = null;
      if (device.owner?.reference?.startsWith('Patient/')) {
        const patientId = device.owner.reference.substring(8);
        patient = await Patient.findOne({ id: patientId });
      }

      res.json({
        resourceType: device.resourceType,
        id: device.id,
        device_id: device.getDeviceId(),
        identifier: device.identifier,
        status: device.status,
        manufacturer: device.manufacturer,
        modelNumber: device.modelNumber,
        serialNumber: device.serialNumber,
        deviceName: device.deviceName,
        type: device.type,
        owner: device.owner,
        patient: patient ? {
          id: patient.id,
          name: patient.name,
          email: patient.telecom?.find(t => t.system === 'email')?.value
        } : null,
        registeredAt: device.registeredAt,
        lastSeenAt: device.lastSeenAt,
        deviceInfo: device.deviceInfo,
        certificateExpiry: device.certificateExpiry,
        needsRenewal: device.needsCertRenewal(),
        revokedAt: device.revokedAt,
        revokedReason: device.revokedReason
      });

    } catch (error) {
      console.error('Get device error:', error);
      res.status(500).json({
        error: 'Failed to get device',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * PUT /admin/devices/:id
   * Update device
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { deviceName, status, deviceInfo } = req.body;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'NOT_FOUND'
        });
      }

      if (deviceName !== undefined) {
        device.deviceName = [{
          name: deviceName,
          type: 'user-friendly-name'
        }];
      }

      if (status && ['active', 'inactive'].includes(status)) {
        device.status = status;
      }

      if (deviceInfo) {
        device.deviceInfo = { ...device.deviceInfo, ...deviceInfo };
      }

      await device.save();

      console.log(`📝 Device updated: ${device.getDeviceId()}`);

      res.json({
        success: true,
        device: {
          id: device.id,
          device_id: device.getDeviceId(),
          status: device.status,
          deviceName: device.deviceName
        }
      });

    } catch (error) {
      console.error('Update device error:', error);
      res.status(500).json({
        error: 'Failed to update device',
        code: 'UPDATE_ERROR'
      });
    }
  }

  /**
   * POST /admin/devices/:id/revoke
   * Revoke device access
   */
  async revoke(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'NOT_FOUND'
        });
      }

      // Revoke device
      device.status = 'inactive';
      device.revokedAt = new Date();
      device.revokedReason = reason || 'Revoked by admin';
      device.jwtRefreshToken = null;
      device.jwtRefreshTokenExpiry = null;
      await device.save();

      console.log(`🚫 Device revoked: ${device.getDeviceId()}`);

      res.json({
        success: true,
        message: 'Device revoked',
        device: {
          id: device.id,
          device_id: device.getDeviceId(),
          status: device.status
        }
      });

    } catch (error) {
      console.error('Revoke device error:', error);
      res.status(500).json({
        error: 'Failed to revoke device',
        code: 'REVOKE_ERROR'
      });
    }
  }

  /**
   * POST /admin/devices/:id/assign
   * Assign device to organization
   */
  async assignToOrg(req, res) {
    try {
      const { organizationId, practitionerRole } = req;
      const { id } = req.params;
      const { targetOrganizationId } = req.body;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'NOT_FOUND'
        });
      }

      // Determine target org
      const targetOrgId = targetOrganizationId || organizationId;

      // Super admins can assign to any org
      const isSuperAdmin = practitionerRole?.isSuperAdmin?.();
      if (!isSuperAdmin && targetOrgId !== organizationId) {
        return res.status(403).json({
          error: 'Can only assign to your organization',
          code: 'ORG_MISMATCH'
        });
      }

      // Assign to org
      device.owner = {
        reference: `Organization/${targetOrgId}`
      };
      await device.save();

      console.log(`🔗 Device ${device.getDeviceId()} assigned to org ${targetOrgId}`);

      res.json({
        success: true,
        device: {
          id: device.id,
          device_id: device.getDeviceId(),
          owner: device.owner
        }
      });

    } catch (error) {
      console.error('Assign device to org error:', error);
      res.status(500).json({
        error: 'Failed to assign device',
        code: 'ASSIGN_ERROR'
      });
    }
  }

  /**
   * POST /admin/devices/:id/reactivate
   * Reactivate a revoked device
   */
  async reactivate(req, res) {
    try {
      const { id } = req.params;

      const device = await FhirDevice.findOne({ id });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found',
          code: 'NOT_FOUND'
        });
      }

      // Reactivate device
      device.status = 'active';
      device.revokedAt = null;
      device.revokedReason = null;
      await device.save();

      console.log(`✅ Device reactivated: ${device.getDeviceId()}`);

      res.json({
        success: true,
        device: {
          id: device.id,
          device_id: device.getDeviceId(),
          status: device.status
        }
      });

    } catch (error) {
      console.error('Reactivate device error:', error);
      res.status(500).json({
        error: 'Failed to reactivate device',
        code: 'REACTIVATE_ERROR'
      });
    }
  }
}

export default new AdminDeviceController();
