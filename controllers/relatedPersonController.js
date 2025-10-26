import RelatedPerson from "../models/RelatedPerson.js";
import Patient from "../models/PatientSchema.js";

class RelatedPersonController {
  constructor() {
    this.createRelatedPerson = this.createRelatedPerson.bind(this);
    this.getRelatedPerson = this.getRelatedPerson.bind(this);
    this.updateRelatedPerson = this.updateRelatedPerson.bind(this);
    this.deleteRelatedPerson = this.deleteRelatedPerson.bind(this);
    this.getAllRelatedPersons = this.getAllRelatedPersons.bind(this);
    this.getRelatedPersonsByPatientEmailForAI = this.getRelatedPersonsByPatientEmailForAI.bind(this);
    this.getRelatedPersonsByPatientEmail = this.getRelatedPersonsByPatientEmail.bind(this);
  }

  async createRelatedPerson(req, res) {
    try {
      const relatedPerson = await RelatedPerson.insertMany(req.body);
      res.status(201).json(relatedPerson);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getRelatedPerson(req, res) {
    try {
      const relatedPerson = await RelatedPerson.findById(req.params.id);
      if (!relatedPerson) {
        return res.status(404).json({ error: "RelatedPerson not found" });
      }
      res.json(relatedPerson);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateRelatedPerson(req, res) {
    try {
      const updatedRelatedPerson = await RelatedPerson.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!updatedRelatedPerson) {
        return res.status(404).json({ error: "RelatedPerson not found" });
      }
      res.json(updatedRelatedPerson);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteRelatedPerson(req, res) {
    try {
      const deletedRelatedPerson = await RelatedPerson.findByIdAndDelete(req.params.id);
      if (!deletedRelatedPerson) {
        return res.status(404).json({ error: "RelatedPerson not found" });
      }
      res.json({ message: "RelatedPerson deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAllRelatedPersons(req, res) {
    try {
      const query = {};
      if (req.query.patient) {
        query["patient.reference"] = req.query.patient;
      }
      const relatedPersons = await RelatedPerson.find(query);
      res.json(relatedPersons);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getRelatedPersonsByPatientEmailForAI(req, res) {
    try {
      const email = req.cookies.email;
      const patient = await Patient.findOne({
        telecom: { $elemMatch: { system: "email", value: email } }
      });

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      const patientReference = `Patient/${patient._id}`;
      const relatedPersons = await RelatedPerson.find({ "patient.reference": patientReference });

      const contacts = relatedPersons.map((person) => ({
        name: `${person.name[0].given[0]} ${person.name[0].family}`,
        email: `${person.telecom[1].value}`
      }));

      res.json(JSON.stringify(contacts));
    } catch (error) {
      console.error("🚨 Error fetching related persons for AI:", error);
      res.status(500).json({ error: error.message });
    }
  }

  async getRelatedPersonsByPatientEmail(req, res) {
    try {
      // User is attached by verifyAccessToken middleware
      const patient = await Patient.findOne({
        telecom: { $elemMatch: { system: "email", value: req.user.email } }
      });

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      const patientReference = `Patient/${patient._id}`;
      const relatedPersons = await RelatedPerson.find({ "patient.reference": patientReference });

      res.json(relatedPersons);
    } catch (error) {
      console.error("🚨 Error fetching related persons:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default new RelatedPersonController();