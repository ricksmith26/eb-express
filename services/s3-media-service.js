import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

const LOG_PREFIX = "[S3MediaService]";

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/mov"];
const ALLOWED_TYPES = [...ALLOWED_PHOTO_TYPES, ...ALLOWED_VIDEO_TYPES];

const URL_EXPIRY_SECONDS = 3600; // 1 hour

class S3MediaService {
  constructor() {
    this.bucket = process.env.S3_MEDIA_BUCKET;
    this.region = process.env.AWS_REGION || "eu-west-2";

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    console.log(`${LOG_PREFIX} Initialized with bucket: ${this.bucket}, region: ${this.region}`);
  }

  getMediaType(mimeType) {
    if (ALLOWED_PHOTO_TYPES.includes(mimeType)) return "photo";
    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return "video";
    return null;
  }

  isAllowedType(mimeType) {
    return ALLOWED_TYPES.includes(mimeType);
  }

  getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/heic": "heic",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "video/mov": "mov",
    };
    return mimeToExt[mimeType] || "bin";
  }

  generateS3Key(patientId, mediaId, mimeType) {
    const ext = this.getExtensionFromMimeType(mimeType);
    return `patient-media/${patientId}/${mediaId}.${ext}`;
  }

  async generateUploadUrl(patientId, filename, contentType) {
    console.log(`${LOG_PREFIX} [generateUploadUrl] START - patientId: ${patientId}, filename: ${filename}, contentType: ${contentType}`);

    if (!this.isAllowedType(contentType)) {
      console.error(`${LOG_PREFIX} [generateUploadUrl] ERROR - Invalid content type: ${contentType}`);
      throw new Error(`Invalid file type: ${contentType}. Allowed types: ${ALLOWED_TYPES.join(", ")}`);
    }

    const mediaId = uuidv4();
    const s3Key = this.generateS3Key(patientId, mediaId, contentType);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType,
    });

    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: URL_EXPIRY_SECONDS,
      });

      console.log(`${LOG_PREFIX} [generateUploadUrl] SUCCESS - mediaId: ${mediaId}, s3Key: ${s3Key}`);

      return {
        uploadUrl,
        mediaId,
        s3Key,
        s3Bucket: this.bucket,
        expiresIn: URL_EXPIRY_SECONDS,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} [generateUploadUrl] ERROR:`, error.message);
      throw error;
    }
  }

  async generateDownloadUrl(s3Key) {
    console.log(`${LOG_PREFIX} [generateDownloadUrl] START - s3Key: ${s3Key}`);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      const downloadUrl = await getSignedUrl(this.client, command, {
        expiresIn: URL_EXPIRY_SECONDS,
      });

      console.log(`${LOG_PREFIX} [generateDownloadUrl] SUCCESS - s3Key: ${s3Key}`);

      return {
        downloadUrl,
        expiresIn: URL_EXPIRY_SECONDS,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} [generateDownloadUrl] ERROR:`, error.message);
      throw error;
    }
  }

  async checkFileExists(s3Key) {
    console.log(`${LOG_PREFIX} [checkFileExists] START - s3Key: ${s3Key}`);

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      const response = await this.client.send(command);
      console.log(`${LOG_PREFIX} [checkFileExists] File exists - s3Key: ${s3Key}, size: ${response.ContentLength}`);
      return {
        exists: true,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        console.log(`${LOG_PREFIX} [checkFileExists] File not found - s3Key: ${s3Key}`);
        return { exists: false };
      }
      console.error(`${LOG_PREFIX} [checkFileExists] ERROR:`, error.message);
      throw error;
    }
  }

  async deleteFile(s3Key) {
    console.log(`${LOG_PREFIX} [deleteFile] START - s3Key: ${s3Key}`);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    try {
      await this.client.send(command);
      console.log(`${LOG_PREFIX} [deleteFile] SUCCESS - s3Key: ${s3Key}`);
      return { deleted: true };
    } catch (error) {
      console.error(`${LOG_PREFIX} [deleteFile] ERROR:`, error.message);
      throw error;
    }
  }

  async listPatientFiles(patientId) {
    console.log(`${LOG_PREFIX} [listPatientFiles] START - patientId: ${patientId}`);

    const prefix = `patient-media/${patientId}/`;
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    try {
      const response = await this.client.send(command);
      const files = (response.Contents || []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));

      console.log(`${LOG_PREFIX} [listPatientFiles] SUCCESS - patientId: ${patientId}, count: ${files.length}`);
      return files;
    } catch (error) {
      console.error(`${LOG_PREFIX} [listPatientFiles] ERROR:`, error.message);
      throw error;
    }
  }
}

export default new S3MediaService();
