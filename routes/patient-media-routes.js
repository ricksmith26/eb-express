import { Router } from "express";
import patientMediaController from "../controllers/patient-media-controller.js";

class PatientMediaRoutes {
  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // Get presigned upload URL
    // POST /api/patient-media/upload-url
    // Body: { patientId, filename, contentType, uploadedBy }
    this.router.post(
      "/upload-url",
      patientMediaController.getUploadUrl
    );

    // Confirm upload completed
    // POST /api/patient-media/:mediaId/confirm
    // Body: { size? }
    this.router.post(
      "/:mediaId/confirm",
      patientMediaController.confirmUpload
    );

    // Get all media for a patient
    // GET /api/patient-media/patient/:patientId?type=photo|video&status=confirmed
    this.router.get(
      "/patient/:patientId",
      patientMediaController.getPatientMedia
    );

    // Get single media record
    // GET /api/patient-media/:mediaId
    this.router.get(
      "/:mediaId",
      patientMediaController.getMediaById
    );

    // Get presigned download URL
    // GET /api/patient-media/:mediaId/download-url
    this.router.get(
      "/:mediaId/download-url",
      patientMediaController.getMediaDownloadUrl
    );

    // Delete media
    // DELETE /api/patient-media/:mediaId
    this.router.delete(
      "/:mediaId",
      patientMediaController.deleteMedia
    );
  }
}

export default new PatientMediaRoutes().router;
