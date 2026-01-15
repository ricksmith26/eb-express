/**
 * Admin Patient Controller
 * Handles patient (customer) management for the admin portal
 */
import Patient from '../models/PatientSchema.js';
import FhirDevice from '../models/FhirDevice.js';

class AdminPatientController {

  /**
   * GET /admin/patients
   * List patients in the current organization
   */
  async list(req, res) {
    try {
      const { organizationId } = req;
      const { search, status, limit = 50, offset = 0 } = req.query;

      // Build query
      const query = {
        'managingOrganization.reference': `Organization/${organizationId}`
      };

      if (status !== undefined) {
        query.active = status === 'active';
      }

      if (search) {
        query.$or = [
          { 'name.family': { $regex: search, $options: 'i' } },
          { 'name.given': { $regex: search, $options: 'i' } },
          { 'telecom.value': { $regex: search, $options: 'i' } }
        ];
      }

      const patients = await Patient.find(query)
        .sort({ 'name.family': 1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Patient.countDocuments(query);

      res.json({
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: patients.map(p => ({
          resource: {
            resourceType: p.resourceType,
            id: p.id,
            name: p.name,
            gender: p.gender,
            birthDate: p.birthDate,
            telecom: p.telecom,
            address: p.address,
            active: p.active
          }
        }))
      });

    } catch (error) {
      console.error('List patients error:', error);
      res.status(500).json({
        error: 'Failed to list patients',
        code: 'LIST_ERROR'
      });
    }
  }

  /**
   * POST /admin/patients
   * Create a new patient
   */
  async create(req, res) {
    try {
      const { practitioner, organizationId } = req;
      const {
        firstName,
        lastName,
        email,
        phone,
        gender,
        birthDate,
        address
      } = req.body;

      if (!firstName && !lastName) {
        return res.status(400).json({
          error: 'Name required',
          code: 'MISSING_NAME'
        });
      }

      // Create patient
      const patient = new Patient({
        name: [{
          use: 'official',
          family: lastName || '',
          given: firstName ? [firstName] : []
        }],
        gender,
        birthDate,
        telecom: [
          ...(email ? [{ system: 'email', value: email }] : []),
          ...(phone ? [{ system: 'phone', value: phone, use: 'mobile' }] : [])
        ],
        address: address ? [address] : [],
        active: true,
        managingOrganization: {
          reference: `Organization/${organizationId}`
        }
      });

      await patient.save();

      console.log(`✅ Patient created: ${firstName} ${lastName} by ${practitioner.email}`);

      res.status(201).json({
        success: true,
        patient: {
          id: patient.id,
          name: patient.name,
          active: patient.active
        }
      });

    } catch (error) {
      console.error('Create patient error:', error);
      res.status(500).json({
        error: 'Failed to create patient',
        code: 'CREATE_ERROR'
      });
    }
  }

  /**
   * GET /admin/patients/:id
   * Get patient details
   */
  async get(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;

      const patient = await Patient.findOne({
        id,
        'managingOrganization.reference': `Organization/${organizationId}`
      });

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          code: 'NOT_FOUND'
        });
      }

      // Get assigned devices
      const devices = await FhirDevice.find({
        'owner.reference': `Patient/${id}`,
        status: 'active'
      }).select('id deviceName status lastSeenAt');

      res.json({
        resourceType: patient.resourceType,
        id: patient.id,
        name: patient.name,
        gender: patient.gender,
        birthDate: patient.birthDate,
        telecom: patient.telecom,
        address: patient.address,
        active: patient.active,
        devices: devices.map(d => ({
          id: d.id,
          name: d.deviceName?.[0]?.name,
          status: d.status,
          lastSeenAt: d.lastSeenAt
        }))
      });

    } catch (error) {
      console.error('Get patient error:', error);
      res.status(500).json({
        error: 'Failed to get patient',
        code: 'GET_ERROR'
      });
    }
  }

  /**
   * PUT /admin/patients/:id
   * Update patient
   */
  async update(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const {
        firstName,
        lastName,
        email,
        phone,
        gender,
        birthDate,
        address,
        active
      } = req.body;

      const patient = await Patient.findOne({
        id,
        'managingOrganization.reference': `Organization/${organizationId}`
      });

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          code: 'NOT_FOUND'
        });
      }

      // Update name
      if (firstName !== undefined || lastName !== undefined) {
        const currentName = patient.name?.[0] || {};
        patient.name = [{
          use: 'official',
          family: lastName !== undefined ? lastName : currentName.family,
          given: firstName !== undefined ? [firstName] : currentName.given
        }];
      }

      // Update telecom
      if (email !== undefined || phone !== undefined) {
        const telecom = [];
        if (email) telecom.push({ system: 'email', value: email });
        if (phone) telecom.push({ system: 'phone', value: phone, use: 'mobile' });
        patient.telecom = telecom;
      }

      if (gender !== undefined) patient.gender = gender;
      if (birthDate !== undefined) patient.birthDate = birthDate;
      if (address !== undefined) patient.address = address ? [address] : [];
      if (active !== undefined) patient.active = active;

      await patient.save();

      console.log(`📝 Patient updated: ${id}`);

      res.json({
        success: true,
        patient: {
          id: patient.id,
          name: patient.name,
          active: patient.active
        }
      });

    } catch (error) {
      console.error('Update patient error:', error);
      res.status(500).json({
        error: 'Failed to update patient',
        code: 'UPDATE_ERROR'
      });
    }
  }

  /**
   * DELETE /admin/patients/:id
   * Delete patient (soft delete)
   */
  async delete(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;

      const patient = await Patient.findOne({
        id,
        'managingOrganization.reference': `Organization/${organizationId}`
      });

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          code: 'NOT_FOUND'
        });
      }

      // Soft delete
      patient.active = false;
      await patient.save();

      // Unassign any devices
      await FhirDevice.updateMany(
        { 'owner.reference': `Patient/${id}` },
        { $unset: { 'owner': '' } }
      );

      console.log(`🗑️ Patient deleted: ${id}`);

      res.json({
        success: true,
        message: 'Patient deleted'
      });

    } catch (error) {
      console.error('Delete patient error:', error);
      res.status(500).json({
        error: 'Failed to delete patient',
        code: 'DELETE_ERROR'
      });
    }
  }

  /**
   * POST /admin/patients/:id/devices
   * Assign a device to a patient
   */
  async assignDevice(req, res) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const { deviceId } = req.body;

      if (!deviceId) {
        return res.status(400).json({
          error: 'Device ID required',
          code: 'MISSING_DEVICE_ID'
        });
      }

      // Verify patient exists in org
      const patient = await Patient.findOne({
        id,
        'managingOrganization.reference': `Organization/${organizationId}`
      });

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      // Verify device exists and belongs to org
      const device = await FhirDevice.findOne({
        id: deviceId,
        $or: [
          { 'owner.reference': `Organization/${organizationId}` },
          { 'owner.reference': { $exists: false } }
        ]
      });

      if (!device) {
        return res.status(404).json({
          error: 'Device not found or not in organization',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Assign device to patient
      device.owner = {
        reference: `Patient/${id}`
      };
      await device.save();

      console.log(`🔗 Device ${deviceId} assigned to patient ${id}`);

      res.json({
        success: true,
        device: {
          id: device.id,
          name: device.deviceName?.[0]?.name,
          status: device.status
        }
      });

    } catch (error) {
      console.error('Assign device error:', error);
      res.status(500).json({
        error: 'Failed to assign device',
        code: 'ASSIGN_ERROR'
      });
    }
  }

  /**
   * DELETE /admin/patients/:id/devices/:deviceId
   * Remove device from patient
   */
  async removeDevice(req, res) {
    try {
      const { organizationId } = req;
      const { id, deviceId } = req.params;

      // Verify patient exists in org
      const patient = await Patient.findOne({
        id,
        'managingOrganization.reference': `Organization/${organizationId}`
      });

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      // Find device assigned to patient
      const device = await FhirDevice.findOne({
        id: deviceId,
        'owner.reference': `Patient/${id}`
      });

      if (!device) {
        return res.status(404).json({
          error: 'Device not assigned to this patient',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Move device back to org
      device.owner = {
        reference: `Organization/${organizationId}`
      };
      await device.save();

      console.log(`🔗 Device ${deviceId} removed from patient ${id}`);

      res.json({
        success: true,
        message: 'Device removed from patient'
      });

    } catch (error) {
      console.error('Remove device error:', error);
      res.status(500).json({
        error: 'Failed to remove device',
        code: 'REMOVE_ERROR'
      });
    }
  }
}

export default new AdminPatientController();
