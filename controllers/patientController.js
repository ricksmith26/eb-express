import Patient from '../models/PatientSchema.js';
import RelatedPerson from '../models/RelatedPerson.js';

class PatientController {
  constructor() {
    this.createPatient = this.createPatient.bind(this);
    this.getPatients = this.getPatients.bind(this);
    this.updatePatient = this.updatePatient.bind(this);
    this.deletePatient = this.deletePatient.bind(this);
    this.getPatientByEmail = this.getPatientByEmail.bind(this);
    this.lookupPatient = this.lookupPatient.bind(this);
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
   * Lookup patient by phone number or email
   * GET /patient/lookup?phone={phone} or GET /patient/lookup?email={email}
   * Returns { patient, contacts } or 404 if not found
   */
  async lookupPatient(req, res) {
    try {
      const { phone, email } = req.query;

      if (!phone && !email) {
        return res.status(400).json({ error: "Either phone or email query parameter is required" });
      }

      let patient;
      if (phone) {
        // Lookup by phone number
        patient = await Patient.findOne({
          telecom: { $elemMatch: { system: "phone", value: phone } }
        });
      } else if (email) {
        // Lookup by email
        patient = await Patient.findOne({
          telecom: { $elemMatch: { system: "email", value: email } }
        });
      }

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      // Fetch related contacts for this patient
      const patientReference = `Patient/${patient._id}`;
      const contacts = await RelatedPerson.find({ "patient.reference": patientReference });

      res.json({ patient, contacts });
    } catch (error) {
      console.error("Error in lookupPatient:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default new PatientController();