import express from "express";
import PatientController from "../controllers/PatientController.js"; // ✅ Import controller

const router = express.Router();

router.get("/email", PatientController.getPatientByEmail); 
router.get("/", PatientController.getPatients); 
router.post("/", PatientController.createPatient);
router.put("/:id", PatientController.updatePatient);
router.delete("/:id", PatientController.deletePatient);

export default router;