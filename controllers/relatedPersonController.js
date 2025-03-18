import RelatedPerson from "../models/RelatedPerson.js";
import Patient from "../models/PatientSchema.js";
import { jwtDecode } from "jwt-decode";


const RelatedPersonController = {
  // Create a new RelatedPerson
  async createRelatedPerson(req, res) {
    try {
      const relatedPerson = RelatedPerson.insertMany(req.body);
      res.status(201).json(relatedPerson);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Get a single RelatedPerson by ID
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
  },

  // Update a RelatedPerson by ID
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
  },

  // Delete a RelatedPerson by ID
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
  },

  // Get all RelatedPersons
  async getAllRelatedPersons(req, res) {
    try {
      const relatedPersons = await RelatedPerson.find();
      res.json(relatedPersons);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
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
  },

  async getRelatedPersonsByPatientEmailForAI(req, res) {
    try {
      const  email  = req.user.email; // Get email from cookie
      // ✅ Find patient by checking for an email inside the telecom array
      const patient = await Patient.findOne({
        telecom: {
          $elemMatch: { system: "email", value: email }, // Ensures email match
        },
      });

      
    //   console.log("🔍 Found Patient:", patient);
  
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
  
      // ✅ Ensure correct patient reference format
      const patientReference = `Patient/${patient._id}`;
  
      console.log("🔗 Searching RelatedPersons with patient reference:", patientReference);
  
      // ✅ Find all related persons linked to this patient
      const relatedPersons = await RelatedPerson.find({ "patient.reference": patientReference });
      const contacts = relatedPersons.map((person) => {
        return {
            name: `${person.name[0].given[0]} ${person.name[0].family}`,
            email: `${person.telecom[1].value}`
        }
      })
      console.log(contacts, '<<contacts')
      res.json(JSON.stringify(contacts));
    } catch (error) {
      console.error("🚨 Error fetching related persons:", error);
      res.status(500).json({ error: error.message });
    }
  },
  async getRelatedPersonsByPatientEmail(req, res) {
    try {
      // console.log("Session Data:", req.session.user.email); // ✅ Debugging: Check if session exists
      // console.log("Session User:", req.user); // ✅ Debugging: Check if Passport sets `req.user`
      console.log(req.headers ,'<<<<<req.headers')
      const decoded = jwtDecode(req.headers.authorization.replace('Bearer ', ''));
      const patient = await Patient.findOne({
        telecom: {
          $elemMatch: { system: "email", value: decoded.email }, // Ensures email match
        },
      });

      
    //   console.log("🔍 Found Patient:", patient);
  
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
  
      // ✅ Ensure correct patient reference format
      const patientReference = `Patient/${patient._id}`;
  
      console.log("🔗 Searching RelatedPersons with patient reference:", patientReference);
  
      // ✅ Find all related persons linked to this patient
      const relatedPersons = await RelatedPerson.find({ "patient.reference": patientReference });
  
      res.json(relatedPersons);
    } catch (error) {
      console.error("🚨 Error fetching related persons:", error);
      res.status(500).json({ error: error.message });
    }
  }
};





export default RelatedPersonController;