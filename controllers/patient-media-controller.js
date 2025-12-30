import s3MediaService from "../services/s3-media-service.js";
import PatientMedia from "../models/PatientMedia.js";

const LOG_PREFIX = "[PatientMediaController]";

class PatientMediaController {
  constructor() {
    this.getUploadUrl = this.getUploadUrl.bind(this);
    this.confirmUpload = this.confirmUpload.bind(this);
    this.getPatientMedia = this.getPatientMedia.bind(this);
    this.getMediaDownloadUrl = this.getMediaDownloadUrl.bind(this);
    this.deleteMedia = this.deleteMedia.bind(this);
    this.getMediaById = this.getMediaById.bind(this);
  }

  async getUploadUrl(req, res) {
    console.log(`${LOG_PREFIX} [getUploadUrl] START`);

    try {
      const { patientId, filename, contentType, uploadedBy } = req.body;

      if (!patientId || !filename || !contentType || !uploadedBy) {
        console.error(`${LOG_PREFIX} [getUploadUrl] ERROR - Missing required fields`);
        return res.status(400).json({
          error: "Missing required fields: patientId, filename, contentType, uploadedBy",
        });
      }

      const mediaType = s3MediaService.getMediaType(contentType);
      if (!mediaType) {
        console.error(`${LOG_PREFIX} [getUploadUrl] ERROR - Invalid content type: ${contentType}`);
        return res.status(400).json({
          error: `Invalid file type: ${contentType}`,
        });
      }

      const { uploadUrl, mediaId, s3Key, s3Bucket, expiresIn } = await s3MediaService.generateUploadUrl(
        patientId,
        filename,
        contentType
      );

      const mediaRecord = new PatientMedia({
        id: mediaId,
        patientId,
        type: mediaType,
        mimeType: contentType,
        filename,
        s3Key,
        s3Bucket,
        status: "pending",
        uploadedBy,
      });

      await mediaRecord.save();

      console.log(`${LOG_PREFIX} [getUploadUrl] SUCCESS - mediaId: ${mediaId}`);

      return res.json({
        uploadUrl,
        mediaId,
        expiresIn,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [getUploadUrl] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }

  async confirmUpload(req, res) {
    console.log(`${LOG_PREFIX} [confirmUpload] START`);

    try {
      const { mediaId } = req.params;
      const { size } = req.body;

      const mediaRecord = await PatientMedia.findOne({ id: mediaId });

      if (!mediaRecord) {
        console.error(`${LOG_PREFIX} [confirmUpload] ERROR - Media not found: ${mediaId}`);
        return res.status(404).json({ error: "Media record not found" });
      }

      if (mediaRecord.status === "confirmed") {
        console.log(`${LOG_PREFIX} [confirmUpload] Already confirmed: ${mediaId}`);
        return res.json({ message: "Upload already confirmed", media: mediaRecord });
      }

      const fileCheck = await s3MediaService.checkFileExists(mediaRecord.s3Key);

      if (!fileCheck.exists) {
        console.error(`${LOG_PREFIX} [confirmUpload] ERROR - File not found in S3: ${mediaRecord.s3Key}`);
        return res.status(400).json({ error: "File not found in S3. Upload may have failed." });
      }

      mediaRecord.status = "confirmed";
      mediaRecord.size = size || fileCheck.size || 0;
      await mediaRecord.save();

      console.log(`${LOG_PREFIX} [confirmUpload] SUCCESS - mediaId: ${mediaId}`);

      return res.json({
        message: "Upload confirmed",
        media: {
          id: mediaRecord.id,
          patientId: mediaRecord.patientId,
          type: mediaRecord.type,
          filename: mediaRecord.filename,
          size: mediaRecord.size,
          uploadedAt: mediaRecord.uploadedAt,
        },
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [confirmUpload] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }

  async getPatientMedia(req, res) {
    console.log(`${LOG_PREFIX} [getPatientMedia] START`);

    try {
      const { patientId } = req.params;
      const { type, status = "confirmed" } = req.query;

      const query = { patientId, status };
      if (type) query.type = type;

      const mediaRecords = await PatientMedia.find(query)
        .sort({ uploadedAt: -1 })
        .lean();

      console.log(`${LOG_PREFIX} [getPatientMedia] SUCCESS - patientId: ${patientId}, count: ${mediaRecords.length}`);

      return res.json({
        patientId,
        count: mediaRecords.length,
        media: mediaRecords.map((m) => ({
          id: m.id,
          type: m.type,
          filename: m.filename,
          mimeType: m.mimeType,
          size: m.size,
          description: m.description,
          uploadedAt: m.uploadedAt,
          uploadedBy: m.uploadedBy,
        })),
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [getPatientMedia] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }

  async getMediaById(req, res) {
    console.log(`${LOG_PREFIX} [getMediaById] START`);

    try {
      const { mediaId } = req.params;

      const mediaRecord = await PatientMedia.findOne({ id: mediaId, status: "confirmed" });

      if (!mediaRecord) {
        console.error(`${LOG_PREFIX} [getMediaById] ERROR - Media not found: ${mediaId}`);
        return res.status(404).json({ error: "Media not found" });
      }

      console.log(`${LOG_PREFIX} [getMediaById] SUCCESS - mediaId: ${mediaId}`);

      return res.json({
        id: mediaRecord.id,
        patientId: mediaRecord.patientId,
        type: mediaRecord.type,
        filename: mediaRecord.filename,
        mimeType: mediaRecord.mimeType,
        size: mediaRecord.size,
        description: mediaRecord.description,
        uploadedAt: mediaRecord.uploadedAt,
        uploadedBy: mediaRecord.uploadedBy,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [getMediaById] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }

  async getMediaDownloadUrl(req, res) {
    console.log(`${LOG_PREFIX} [getMediaDownloadUrl] START`);

    try {
      const { mediaId } = req.params;

      const mediaRecord = await PatientMedia.findOne({ id: mediaId, status: "confirmed" });

      if (!mediaRecord) {
        console.error(`${LOG_PREFIX} [getMediaDownloadUrl] ERROR - Media not found: ${mediaId}`);
        return res.status(404).json({ error: "Media not found" });
      }

      const { downloadUrl, expiresIn } = await s3MediaService.generateDownloadUrl(mediaRecord.s3Key);

      console.log(`${LOG_PREFIX} [getMediaDownloadUrl] SUCCESS - mediaId: ${mediaId}`);

      return res.json({
        mediaId,
        downloadUrl,
        expiresIn,
        filename: mediaRecord.filename,
        mimeType: mediaRecord.mimeType,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [getMediaDownloadUrl] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteMedia(req, res) {
    console.log(`${LOG_PREFIX} [deleteMedia] START`);

    try {
      const { mediaId } = req.params;

      const mediaRecord = await PatientMedia.findOne({ id: mediaId });

      if (!mediaRecord) {
        console.error(`${LOG_PREFIX} [deleteMedia] ERROR - Media not found: ${mediaId}`);
        return res.status(404).json({ error: "Media not found" });
      }

      await s3MediaService.deleteFile(mediaRecord.s3Key);

      mediaRecord.status = "deleted";
      await mediaRecord.save();

      console.log(`${LOG_PREFIX} [deleteMedia] SUCCESS - mediaId: ${mediaId}`);

      return res.json({
        message: "Media deleted successfully",
        mediaId,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} [deleteMedia] ERROR:`, error.message, error.stack);
      return res.status(500).json({ error: error.message });
    }
  }
}

export default new PatientMediaController();
