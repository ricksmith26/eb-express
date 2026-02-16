import Patient from '../models/PatientSchema.js';
import RelatedPerson from '../models/RelatedPerson.js';
import AllergyIntolerance from '../models/FhirAllergyIntolerance.js';
import Condition from '../models/FhirCondition.js';
import MedicationStatement from '../models/FhirMedicationStatement.js';

class PatientController {
  constructor() {
    this.createPatient = this.createPatient.bind(this);
    this.getPatients = this.getPatients.bind(this);
    this.getPatientById = this.getPatientById.bind(this);
    this.updatePatient = this.updatePatient.bind(this);
    this.deletePatient = this.deletePatient.bind(this);
    this.getPatientByEmail = this.getPatientByEmail.bind(this);
    this.lookupPatient = this.lookupPatient.bind(this);
    this.searchPatients = this.searchPatients.bind(this);
    this.updateMedicalInfo = this.updateMedicalInfo.bind(this);
    this.getClinicalSummary = this.getClinicalSummary.bind(this);
  }

  async createPatient(req, res) {
    try {
      const patient = new Patient(req.body);
      await patient.save();
      res.status(201).json(patient);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getPatients(req, res) {
    const patients = await Patient.find();
    res.json(patients);
  }

  async getPatientById(req, res) {
    try {
      const patient = await Patient.findById(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updatePatient(req, res) {
    try {
      const updatedPatient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updatedPatient) return res.status(404).json({ error: "Patient not found" });
      res.json(updatedPatient);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deletePatient(req, res) {
    try {
      const deletedPatient = await Patient.findByIdAndDelete(req.params.id);
      if (!deletedPatient) return res.status(404).json({ error: "Patient not found" });
      res.json({ message: "Patient deleted successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getPatientByEmail(req, res) {
    try {
      // User is attached by verifyAccessToken middleware
      const email = req.user.email;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const patient = await Patient.findOne({ "telecom.value": email, "telecom.system": "email" });

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      res.json(patient);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Search patients by multiple criteria
   * GET /patient/search?name={name}&phone={phone}&nhsNumber={nhs}&addressLine={address}&postcode={postcode}
   * All parameters are optional, returns patients matching ALL provided criteria
   */
  async searchPatients(req, res) {
    try {
      const { name, phone, nhsNumber, addressLine, postcode } = req.query;

      if (!name && !phone && !nhsNumber && !addressLine && !postcode) {
        return res.status(400).json({
          success: false,
          error: "At least one search parameter is required (name, phone, nhsNumber, addressLine, or postcode)"
        });
      }

      const query = { $and: [] };

      // Name search (partial match on given or family name)
      if (name) {
        const nameRegex = new RegExp(name, 'i');
        query.$and.push({
          $or: [
            { 'name.given': { $elemMatch: { $regex: nameRegex } } },
            { 'name.family': { $regex: nameRegex } }
          ]
        });
      }

      // Phone search with UK number normalization
      if (phone) {
        const phoneVariants = [phone];
        const cleanPhone = phone.replace(/\s+/g, '');

        if (cleanPhone.startsWith('+44')) {
          phoneVariants.push('0' + cleanPhone.slice(3));
        } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
          phoneVariants.push('+44' + cleanPhone.slice(1));
        }

        query.$and.push({
          telecom: {
            $elemMatch: {
              system: 'phone',
              value: { $in: phoneVariants }
            }
          }
        });
      }

      // NHS Number search (stored in identifier array)
      if (nhsNumber) {
        const cleanNhs = nhsNumber.replace(/\s+/g, '');
        query.$and.push({
          $or: [
            { 'identifier.value': cleanNhs },
            { 'identifier.value': nhsNumber }
          ]
        });
      }

      // Address line search (partial match on first line of address)
      if (addressLine) {
        const addressRegex = new RegExp(addressLine, 'i');
        query.$and.push({
          'address.line': { $elemMatch: { $regex: addressRegex } }
        });
      }

      // Postcode search (partial match)
      if (postcode) {
        const postcodeRegex = new RegExp(postcode.replace(/\s+/g, '\\s*'), 'i');
        query.$and.push({
          'address.postalCode': { $regex: postcodeRegex }
        });
      }

      // If no criteria added, return empty (shouldn't happen due to check above)
      if (query.$and.length === 0) {
        return res.json({ success: true, data: [], total: 0 });
      }

      const patients = await Patient.find(query).limit(50);

      res.json({
        success: true,
        data: patients,
        total: patients.length
      });
    } catch (error) {
      console.error("Error in searchPatients:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Lookup patient by phone number or email
   * GET /patient/lookup?phone={phone} or GET /patient/lookup?email={email}
   * Returns { patient, contacts } or 404 if not found
   */
  async lookupPatient(req, res) {
    try {
      const { phone, email, patientId } = req.query;

      if (!phone && !email && !patientId) {
        return res.status(400).json({ error: "Either phone, email, or patientId query parameter is required" });
      }

      let patient;
      if (phone) {
        // Generate phone number variants (UK international and local formats)
        const phoneVariants = [phone];

        if (phone.startsWith('+44')) {
          // Convert +447939043476 to 07939043476
          phoneVariants.push('0' + phone.slice(3));
        } else if (phone.startsWith('0') && phone.length === 11) {
          // Convert 07939043476 to +447939043476
          phoneVariants.push('+44' + phone.slice(1));
        }

        console.log('Phone lookup - input:', phone, 'variants:', phoneVariants);

        // Lookup by phone number (search all variants)
        patient = await Patient.findOne({
          telecom: {
            $elemMatch: {
              system: "phone",
              value: { $in: phoneVariants }
            }
          }
        });
      } 
      if (patientId) {
        // Lookup by patient ID
        patient = await Patient.findById(patientId);
      } else if (email) {
        // Lookup by email
        patient = await Patient.findOne({
          telecom: { $elemMatch: { system: "email", value: email } }
        });
      }

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      // Fetch related contacts for this patient (search both _id and FHIR id formats)
      const patientRefs = [`Patient/${patient._id}`, `Patient/${patient.id}`];
      const contacts = await RelatedPerson.find({ "patient.reference": { $in: patientRefs } });

      res.json({ patient, contacts });
    } catch (error) {
      console.error("Error in lookupPatient:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update medical information for a patient
   * PATCH /patient/:id/medical-info
   * Body: { bloodType, gpPractice, gpPhone, medications, allergies, conditions, nhsNumber }
   */
  async updateMedicalInfo(req, res) {
    try {
      const { id } = req.params;
      const { bloodType, gpPractice, gpPhone, medications, allergies, conditions, nhsNumber } = req.body;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({ success: false, error: "Patient not found" });
      }

      // Update medical info fields
      if (!patient.medicalInfo) {
        patient.medicalInfo = {};
      }

      if (bloodType !== undefined) patient.medicalInfo.bloodType = bloodType;
      if (gpPractice !== undefined) patient.medicalInfo.gpPractice = gpPractice;
      if (gpPhone !== undefined) patient.medicalInfo.gpPhone = gpPhone;
      if (medications !== undefined) patient.medicalInfo.medications = medications;
      if (allergies !== undefined) patient.medicalInfo.allergies = allergies;
      if (conditions !== undefined) patient.medicalInfo.conditions = conditions;

      // Update NHS number in identifier array
      if (nhsNumber !== undefined) {
        const nhsIdentifierIndex = patient.identifier?.findIndex(
          id => id.system === 'https://fhir.nhs.uk/Id/nhs-number'
        );

        if (nhsIdentifierIndex >= 0) {
          patient.identifier[nhsIdentifierIndex].value = nhsNumber;
        } else {
          if (!patient.identifier) patient.identifier = [];
          patient.identifier.push({
            system: 'https://fhir.nhs.uk/Id/nhs-number',
            value: nhsNumber
          });
        }
      }

      await patient.save();

      res.json({
        success: true,
        data: patient
      });
    } catch (error) {
      console.error("Error in updateMedicalInfo:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get clinical summary for a patient (bundled FHIR resources)
   * GET /patient/:id/clinical-summary
   * Returns { patient, allergies, conditions, medications, contacts }
   */
  async getClinicalSummary(req, res) {
    try {
      const { id } = req.params;

      // Fetch patient
      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({ success: false, error: "Patient not found" });
      }

      // Build reference strings for queries (search both _id and FHIR id formats)
      const patientRef = `Patient/${patient._id}`;
      const patientRefs = [`Patient/${patient._id}`, `Patient/${patient.id}`];

      // Fetch all clinical resources in parallel
      const [allergies, conditions, medications, contacts] = await Promise.all([
        AllergyIntolerance.find({ "patient.reference": patientRef }).sort({ recordedDate: -1 }),
        Condition.find({ "subject.reference": patientRef }).sort({ recordedDate: -1 }),
        MedicationStatement.find({ "subject.reference": patientRef }).sort({ dateAsserted: -1 }),
        RelatedPerson.find({ "patient.reference": { $in: patientRefs } }),
      ]);

      // Get NHS number from identifier
      const nhsIdentifier = patient.identifier?.find(
        id => id.system === 'https://fhir.nhs.uk/Id/nhs-number'
      );

      res.json({
        success: true,
        data: {
          patient,
          nhsNumber: nhsIdentifier?.value || null,
          allergies,
          conditions,
          medications,
          contacts,
          // Include legacy medicalInfo for backward compatibility
          legacyMedicalInfo: patient.medicalInfo || null,
        }
      });
    } catch (error) {
      console.error("Error in getClinicalSummary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new PatientController();