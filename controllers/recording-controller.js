import recordingService from "../services/recording-service.js";

class RecordingController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.listRecordings = this.listRecordings.bind(this);
    this.getRecordingDownloadUrl = this.getRecordingDownloadUrl.bind(this);
    this.attachRecordingToCall = this.attachRecordingToCall.bind(this);
    this.getCallRecording = this.getCallRecording.bind(this);
    this.findRecordingsForCall = this.findRecordingsForCall.bind(this);
    this.deleteRecording = this.deleteRecording.bind(this);
  }

  /**
   * GET /recordings
   * List all recordings with optional filters
   */
  async listRecordings(req, res) {
    try {
      const { date, direction, limit } = req.query;

      const recordings = await recordingService.listRecordings({
        date,
        direction,
        limit: limit ? parseInt(limit) : 100,
      });

      return res.json({
        success: true,
        count: recordings.length,
        recordings,
      });
    } catch (error) {
      console.error("[RecordingController] Error listing recordings:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to list recordings",
        error: error.message,
      });
    }
  }

  /**
   * GET /recordings/:key/download
   * Get a presigned download URL for a recording
   * Note: key should be URL-encoded (e.g., 20260117%2F143022-100-+447939043476-outbound.wav)
   */
  async getRecordingDownloadUrl(req, res) {
    try {
      const { key } = req.params;
      const decodedKey = decodeURIComponent(key);

      // Check if recording exists
      const exists = await recordingService.recordingExists(decodedKey);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Recording not found",
        });
      }

      const { downloadUrl, expiresIn, expiresAt } = await recordingService.generateDownloadUrl(decodedKey);

      return res.json({
        success: true,
        key: decodedKey,
        downloadUrl,
        expiresIn,
        expiresAt,
      });
    } catch (error) {
      console.error("[RecordingController] Error generating download URL:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to generate download URL",
        error: error.message,
      });
    }
  }

  /**
   * POST /recordings/attach
   * Attach a recording to a call (Communication record)
   * Body: { callId: string, s3Key: string }
   */
  async attachRecordingToCall(req, res) {
    try {
      const { callId, s3Key } = req.body;

      if (!callId || !s3Key) {
        return res.status(400).json({
          success: false,
          message: "callId and s3Key are required",
        });
      }

      // Check if recording exists
      const exists = await recordingService.recordingExists(s3Key);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Recording not found in S3",
        });
      }

      const result = await recordingService.attachRecordingToCall(callId, s3Key);

      return res.json({
        success: true,
        message: "Recording attached to call",
        callId,
        recording: result.recording,
      });
    } catch (error) {
      console.error("[RecordingController] Error attaching recording:", error.message);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to attach recording to call",
        error: error.message,
      });
    }
  }

  /**
   * GET /recordings/call/:callId
   * Get the recording attached to a specific call
   */
  async getCallRecording(req, res) {
    try {
      const { callId } = req.params;

      const recording = await recordingService.getRecordingForCall(callId);

      if (!recording) {
        return res.status(404).json({
          success: false,
          message: "No recording found for this call",
        });
      }

      return res.json({
        success: true,
        callId,
        recording,
      });
    } catch (error) {
      console.error("[RecordingController] Error getting call recording:", error.message);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to get call recording",
        error: error.message,
      });
    }
  }

  /**
   * GET /recordings/call/:callId/find
   * Find recordings that might match a call (for manual linking)
   */
  async findRecordingsForCall(req, res) {
    try {
      const { callId } = req.params;

      const recordings = await recordingService.findRecordingsForCall(callId);

      return res.json({
        success: true,
        callId,
        count: recordings.length,
        recordings,
      });
    } catch (error) {
      console.error("[RecordingController] Error finding recordings:", error.message);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to find recordings for call",
        error: error.message,
      });
    }
  }

  /**
   * DELETE /recordings/:key
   * Delete a recording from S3
   */
  async deleteRecording(req, res) {
    try {
      const { key } = req.params;
      const decodedKey = decodeURIComponent(key);

      // Check if recording exists
      const exists = await recordingService.recordingExists(decodedKey);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Recording not found",
        });
      }

      await recordingService.deleteRecording(decodedKey);

      return res.json({
        success: true,
        message: "Recording deleted",
        key: decodedKey,
      });
    } catch (error) {
      console.error("[RecordingController] Error deleting recording:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to delete recording",
        error: error.message,
      });
    }
  }
}

export default new RecordingController();
