import Patient from '../models/PatientSchema.js';

class PatientController {
  constructor() {
    this.createPatient = this.createPatient.bind(this);
    this.getPatients = this.getPatients.bind(this);
    this.updatePatient = this.updatePatient.bind(this);
    this.deletePatient = this.deletePatient.bind(this);
    this.getPatientByEmail = this.getPatientByEmail.bind(this);
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
}

export default new PatientController();