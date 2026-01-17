import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import FhirCommunication from "../models/FhirCommunication.js";

class RecordingService {
  constructor() {
    this.bucket = process.env.S3_RECORDING_BUCKET;
    this.region = process.env.AWS_REGION || "eu-west-2";
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log(`[RecordingService] Initialized with bucket: ${this.bucket}`);
  }

  /**
   * List all recordings in S3 bucket
   * @param {Object} options - Filter options
   * @param {string} options.date - Filter by date (YYYYMMDD format)
   * @param {string} options.direction - Filter by direction (inbound, outbound, internal)
   * @param {number} options.limit - Max results to return
   * @returns {Promise<Array>} List of recording metadata
   */
  async listRecordings(options = {}) {
    const { date, direction, limit = 100 } = options;

    // Build prefix based on filters
    let prefix = "";
    if (date) {
      prefix = `${date}/`;
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: limit,
    });

    try {
      const response = await this.client.send(command);
      let recordings = (response.Contents || []).map((obj) => {
        const parsed = this.parseRecordingKey(obj.Key);
        return {
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          ...parsed,
        };
      });

      // Filter by direction if specified
      if (direction) {
        recordings = recordings.filter((r) => r.direction === direction);
      }

      return recordings;
    } catch (error) {
      console.error("[RecordingService] Error listing recordings:", error.message);
      throw error;
    }
  }

  /**
   * Parse recording filename to extract metadata
   * Format: YYYYMMDD/HHMMSS-{CALLERID}-{DIALED}-{direction}.wav
   * @param {string} key - S3 key
   * @returns {Object} Parsed metadata
   */
  parseRecordingKey(key) {
    try {
      // Example: 20260117/143022-+447939043476-+447400208165-inbound.wav
      const parts = key.split("/");
      const date = parts[0]; // YYYYMMDD
      const filename = parts[1]; // HHMMSS-caller-dialed-direction.wav

      if (!filename) {
        return { date, filename: key };
      }

      // Remove .wav extension and split
      const withoutExt = filename.replace(".wav", "");
      const segments = withoutExt.split("-");

      // Last segment is direction
      const direction = segments.pop();
      // First segment is time
      const time = segments.shift();
      // Remaining segments are caller and dialed (may contain - in phone numbers)
      // For phone numbers with +, they don't have internal dashes
      // Format: HHMMSS-caller-dialed-direction
      const callerAndDialed = segments.join("-");

      // Try to split caller and dialed
      // If direction is "internal", both are extensions (numeric)
      // If direction is "inbound" or "outbound", one is a phone number
      let caller, dialed;
      if (direction === "internal") {
        // Both are extensions, split by -
        const idx = callerAndDialed.lastIndexOf("-");
        if (idx > 0) {
          caller = callerAndDialed.substring(0, idx);
          dialed = callerAndDialed.substring(idx + 1);
        } else {
          caller = callerAndDialed;
          dialed = "";
        }
      } else {
        // One is a phone number (starts with +), one is an extension
        // Find the position where the second identifier starts
        const match = callerAndDialed.match(/^(\+?\d+)-(.+)$/);
        if (match) {
          caller = match[1];
          dialed = match[2];
        } else {
          caller = callerAndDialed;
          dialed = "";
        }
      }

      return {
        date,
        time,
        caller,
        dialed,
        direction,
        filename,
      };
    } catch (error) {
      console.error("[RecordingService] Error parsing key:", key, error.message);
      return { filename: key };
    }
  }

  /**
   * Generate a presigned download URL for a recording
   * @param {string} s3Key - The S3 object key
   * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
   * @returns {Promise<Object>} Download URL and expiry info
   */
  async generateDownloadUrl(s3Key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      const url = await getSignedUrl(this.client, command, { expiresIn });
      return {
        downloadUrl: url,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (error) {
      console.error("[RecordingService] Error generating download URL:", error.message);
      throw error;
    }
  }

  /**
   * Check if a recording exists in S3
   * @param {string} s3Key - The S3 object key
   * @returns {Promise<boolean>}
   */
  async recordingExists(s3Key) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete a recording from S3
   * @param {string} s3Key - The S3 object key
   * @returns {Promise<boolean>}
   */
  async deleteRecording(s3Key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      await this.client.send(command);
      console.log(`[RecordingService] Deleted recording: ${s3Key}`);
      return true;
    } catch (error) {
      console.error("[RecordingService] Error deleting recording:", error.message);
      throw error;
    }
  }

  /**
   * Attach a recording URL to a Communication record
   * @param {string} callId - The call ID (from callMetadata.callId)
   * @param {string} s3Key - The S3 object key for the recording
   * @returns {Promise<Object>} Updated Communication record
   */
  async attachRecordingToCall(callId, s3Key) {
    // Find the Communication record
    const communication = await FhirCommunication.findOne({
      "callMetadata.callId": callId,
    });

    if (!communication) {
      throw new Error(`Communication record not found for callId: ${callId}`);
    }

    // Generate presigned URL
    const { downloadUrl, expiresAt } = await this.generateDownloadUrl(s3Key);

    // Parse recording metadata from key
    const recordingMeta = this.parseRecordingKey(s3Key);

    // Add or update the recording attachment in payload
    const attachment = {
      contentType: "audio/wav",
      url: `s3://${this.bucket}/${s3Key}`,
      title: "Call Recording",
      creation: new Date(),
    };

    // Initialize payload array if needed
    if (!communication.payload) {
      communication.payload = [];
    }

    // Check if there's already an attachment, update it or add new
    const existingAttachmentIndex = communication.payload.findIndex(
      (p) => p.contentAttachment && p.contentAttachment.title === "Call Recording"
    );

    if (existingAttachmentIndex >= 0) {
      communication.payload[existingAttachmentIndex].contentAttachment = attachment;
    } else {
      communication.payload.push({ contentAttachment: attachment });
    }

    await communication.save();

    console.log(`[RecordingService] Attached recording ${s3Key} to call ${callId}`);

    return {
      communication,
      recording: {
        s3Key,
        downloadUrl,
        expiresAt,
        ...recordingMeta,
      },
    };
  }

  /**
   * Find recordings that match a Communication record
   * Based on timestamp, caller, and dialed number
   * @param {string} callId - The call ID
   * @returns {Promise<Array>} Matching recordings
   */
  async findRecordingsForCall(callId) {
    const communication = await FhirCommunication.findOne({
      "callMetadata.callId": callId,
    });

    if (!communication) {
      throw new Error(`Communication record not found for callId: ${callId}`);
    }

    // Get call start time
    const callDate = communication.sent || communication.createdAt;
    if (!callDate) {
      return [];
    }

    // Format date as YYYYMMDD for S3 prefix
    const dateStr = callDate.toISOString().slice(0, 10).replace(/-/g, "");

    // List recordings for that date
    const recordings = await this.listRecordings({ date: dateStr });

    // Filter by caller/recipient identifiers
    const senderValue = communication.sender?.identifier?.value;
    const recipientValue = communication.recipient?.[0]?.identifier?.value;

    return recordings.filter((r) => {
      // Check if caller or dialed matches sender or recipient
      return (
        r.caller === senderValue ||
        r.dialed === senderValue ||
        r.caller === recipientValue ||
        r.dialed === recipientValue
      );
    });
  }

  /**
   * Get recording with fresh download URL for a Communication
   * @param {string} callId - The call ID
   * @returns {Promise<Object|null>} Recording info with download URL
   */
  async getRecordingForCall(callId) {
    const communication = await FhirCommunication.findOne({
      "callMetadata.callId": callId,
    });

    if (!communication) {
      throw new Error(`Communication record not found for callId: ${callId}`);
    }

    // Find the recording attachment
    const recordingPayload = communication.payload?.find(
      (p) => p.contentAttachment && p.contentAttachment.title === "Call Recording"
    );

    if (!recordingPayload?.contentAttachment?.url) {
      return null;
    }

    // Extract S3 key from URL (format: s3://bucket/key)
    const s3Url = recordingPayload.contentAttachment.url;
    const s3Key = s3Url.replace(`s3://${this.bucket}/`, "");

    // Generate fresh download URL
    const { downloadUrl, expiresAt } = await this.generateDownloadUrl(s3Key);
    const recordingMeta = this.parseRecordingKey(s3Key);

    return {
      s3Key,
      downloadUrl,
      expiresAt,
      contentType: recordingPayload.contentAttachment.contentType,
      ...recordingMeta,
    };
  }
}

export default new RecordingService();
