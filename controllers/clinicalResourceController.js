import AllergyIntolerance from "../models/FhirAllergyIntolerance.js";
import Condition from "../models/FhirCondition.js";
import MedicationStatement from "../models/FhirMedicationStatement.js";

class ClinicalResourceController {
  constructor() {
    // Bind all methods
    this.createAllergy = this.createAllergy.bind(this);
    this.getAllergies = this.getAllergies.bind(this);
    this.getAllergyById = this.getAllergyById.bind(this);
    this.updateAllergy = this.updateAllergy.bind(this);
    this.deleteAllergy = this.deleteAllergy.bind(this);

    this.createCondition = this.createCondition.bind(this);
    this.getConditions = this.getConditions.bind(this);
    this.getConditionById = this.getConditionById.bind(this);
    this.updateCondition = this.updateCondition.bind(this);
    this.deleteCondition = this.deleteCondition.bind(this);

    this.createMedication = this.createMedication.bind(this);
    this.getMedications = this.getMedications.bind(this);
    this.getMedicationById = this.getMedicationById.bind(this);
    this.updateMedication = this.updateMedication.bind(this);
    this.deleteMedication = this.deleteMedication.bind(this);
  }

  // ========== AllergyIntolerance CRUD ==========

  async createAllergy(req, res) {
    try {
      const allergy = new AllergyIntolerance(req.body);
      await allergy.save();
      res.status(201).json({ success: true, data: allergy });
    } catch (error) {
      console.error("Error creating AllergyIntolerance:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getAllergies(req, res) {
    try {
      const { patient } = req.query;
      const query = {};

      if (patient) {
        query["patient.reference"] = patient;
      }

      const allergies = await AllergyIntolerance.find(query).sort({ recordedDate: -1 });
      res.json({ success: true, data: allergies, total: allergies.length });
    } catch (error) {
      console.error("Error fetching allergies:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getAllergyById(req, res) {
    try {
      const allergy = await AllergyIntolerance.findById(req.params.id);
      if (!allergy) {
        return res.status(404).json({ success: false, error: "AllergyIntolerance not found" });
      }
      res.json({ success: true, data: allergy });
    } catch (error) {
      console.error("Error fetching allergy:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateAllergy(req, res) {
    try {
      const allergy = await AllergyIntolerance.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!allergy) {
        return res.status(404).json({ success: false, error: "AllergyIntolerance not found" });
      }
      res.json({ success: true, data: allergy });
    } catch (error) {
      console.error("Error updating allergy:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async deleteAllergy(req, res) {
    try {
      const allergy = await AllergyIntolerance.findByIdAndDelete(req.params.id);
      if (!allergy) {
        return res.status(404).json({ success: false, error: "AllergyIntolerance not found" });
      }
      res.json({ success: true, message: "AllergyIntolerance deleted successfully" });
    } catch (error) {
      console.error("Error deleting allergy:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== Condition CRUD ==========

  async createCondition(req, res) {
    try {
      const condition = new Condition(req.body);
      await condition.save();
      res.status(201).json({ success: true, data: condition });
    } catch (error) {
      console.error("Error creating Condition:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getConditions(req, res) {
    try {
      const { patient } = req.query;
      const query = {};

      if (patient) {
        query["subject.reference"] = patient;
      }

      const conditions = await Condition.find(query).sort({ recordedDate: -1 });
      res.json({ success: true, data: conditions, total: conditions.length });
    } catch (error) {
      console.error("Error fetching conditions:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getConditionById(req, res) {
    try {
      const condition = await Condition.findById(req.params.id);
      if (!condition) {
        return res.status(404).json({ success: false, error: "Condition not found" });
      }
      res.json({ success: true, data: condition });
    } catch (error) {
      console.error("Error fetching condition:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateCondition(req, res) {
    try {
      const condition = await Condition.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!condition) {
        return res.status(404).json({ success: false, error: "Condition not found" });
      }
      res.json({ success: true, data: condition });
    } catch (error) {
      console.error("Error updating condition:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async deleteCondition(req, res) {
    try {
      const condition = await Condition.findByIdAndDelete(req.params.id);
      if (!condition) {
        return res.status(404).json({ success: false, error: "Condition not found" });
      }
      res.json({ success: true, message: "Condition deleted successfully" });
    } catch (error) {
      console.error("Error deleting condition:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== MedicationStatement CRUD ==========

  async createMedication(req, res) {
    try {
      const medication = new MedicationStatement(req.body);
      await medication.save();
      res.status(201).json({ success: true, data: medication });
    } catch (error) {
      console.error("Error creating MedicationStatement:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getMedications(req, res) {
    try {
      const { patient } = req.query;
      const query = {};

      if (patient) {
        query["subject.reference"] = patient;
      }

      const medications = await MedicationStatement.find(query).sort({ dateAsserted: -1 });
      res.json({ success: true, data: medications, total: medications.length });
    } catch (error) {
      console.error("Error fetching medications:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getMedicationById(req, res) {
    try {
      const medication = await MedicationStatement.findById(req.params.id);
      if (!medication) {
        return res.status(404).json({ success: false, error: "MedicationStatement not found" });
      }
      res.json({ success: true, data: medication });
    } catch (error) {
      console.error("Error fetching medication:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateMedication(req, res) {
    try {
      const medication = await MedicationStatement.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!medication) {
        return res.status(404).json({ success: false, error: "MedicationStatement not found" });
      }
      res.json({ success: true, data: medication });
    } catch (error) {
      console.error("Error updating medication:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async deleteMedication(req, res) {
    try {
      const medication = await MedicationStatement.findByIdAndDelete(req.params.id);
      if (!medication) {
        return res.status(404).json({ success: false, error: "MedicationStatement not found" });
      }
      res.json({ success: true, message: "MedicationStatement deleted successfully" });
    } catch (error) {
      console.error("Error deleting medication:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new ClinicalResourceController();
