import express from "express";
import RelatedPersonController from "../controllers/relatedPersonController.js";

const router = express.Router();

router.get("/email/ai", RelatedPersonController.getRelatedPersonsByPatientEmailForAI);
router.get("/email", RelatedPersonController.getRelatedPersonsByPatientEmail);
router.post("/", RelatedPersonController.createRelatedPerson);
router.get("/:id", RelatedPersonController.getRelatedPerson);
router.put("/:id", RelatedPersonController.updateRelatedPerson);
router.delete("/:id", RelatedPersonController.deleteRelatedPerson);
router.get("/", RelatedPersonController.getAllRelatedPersons);


export default router;