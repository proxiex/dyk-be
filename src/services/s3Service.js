const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { ApiError } = require('../middleware/errorHandler');

/**
 * AWS S3 service for media storage
 */
class S3Service {
  constructor() {
    // Configure AWS
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
    });

    this.s3 = new AWS.S3({
      apiVersion: '2006-03-01',
    });

    this.bucketName = process.env.AWS_S3_BUCKET;
    
    if (!this.bucketName) {
      logger.warn('AWS_S3_BUCKET not configured. S3 functionality will be disabled.');
    }

    // File size limits
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    this.ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    this.ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime'];
  }

  /**
   * Check if S3 is properly configured
   */
  isConfigured() {
    return !!(this.bucketName && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  }

  /**
   * Test S3 connection
   */
  async testConnection() {
    try {
      if (!this.isConfigured()) {
        throw new Error('S3 not configured');
      }

      await this.s3.headBucket({ Bucket: this.bucketName }).promise();
      return true;
    } catch (error) {
      logger.error('S3 connection test failed:', error);
      return false;
    }
  }

  /**
   * Generate unique filename
   */
  generateFileName(originalName, prefix = 'facts') {
    const extension = path.extname(originalName).toLowerCase();
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    return `${prefix}/${timestamp}-${uuid}${extension}`;
  }

  /**
   * Validate file type and size
   */
  validateFile(file, type = 'image') {
    const allowedTypes = type === 'image' ? this.ALLOWED_IMAGE_TYPES : this.ALLOWED_VIDEO_TYPES;
    
    if (!allowedTypes.includes(file.mimetype)) {
      throw new ApiError(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`, 400);
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new ApiError(`File size too large. Maximum size: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(file, options = {}) {
    try {
      if (!this.isConfigured()) {
        throw new ApiError('S3 storage not configured', 500);
      }

      const {
        prefix = 'facts',
        acl = 'public-read',
        contentType = file.mimetype,
        metadata = {},
      } = options;

      this.validateFile(file, options.type || 'image');

      const key = this.generateFileName(file.originalname, prefix);
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        ACL: acl,
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      };

      const result = await this.s3.upload(uploadParams).promise();
      
      logger.info('File uploaded to S3', {
        key,
        location: result.Location,
        size: file.size,
      });

      return {
        key: result.Key,
        url: result.Location,
        bucket: result.Bucket,
        size: file.size,
        contentType,
        originalName: file.originalname,
      };
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError('Failed to upload file', 500);
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files, options = {}) {
    try {
      if (!Array.isArray(files)) {
        files = [files];
      }

      const uploadPromises = files.map(file => this.uploadFile(file, options));
      const results = await Promise.all(uploadPromises);

      return results;
    } catch (error) {
      logger.error('Error uploading multiple files:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    try {
      if (!this.isConfigured()) {
        logger.warn('S3 not configured, skipping file deletion');
        return;
      }

      const deleteParams = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3.deleteObject(deleteParams).promise();
      
      logger.info('File deleted from S3', { key });
      return true;
    } catch (error) {
      logger.error('Error deleting file from S3:', error, { key });
      return false;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(keys) {
    try {
      if (!this.isConfigured()) {
        logger.warn('S3 not configured, skipping file deletion');
        return;
      }

      if (!Array.isArray(keys) || keys.length === 0) {
        return;
      }

      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false,
        },
      };

      const result = await this.s3.deleteObjects(deleteParams).promise();
      
      logger.info('Multiple files deleted from S3', {
        deleted: result.Deleted.length,
        errors: result.Errors.length,
      });

      return result;
    } catch (error) {
      logger.error('Error deleting multiple files from S3:', error);
      return null;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key) {
    try {
      if (!this.isConfigured()) {
        throw new ApiError('S3 not configured', 500);
      }

      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      const result = await this.s3.headObject(params).promise();
      
      return {
        key,
        size: result.ContentLength,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        metadata: result.Metadata,
        etag: result.ETag,
      };
    } catch (error) {
      logger.error('Error getting file metadata:', error, { key });
      if (error.statusCode === 404) {
        throw new ApiError('File not found', 404);
      }
      throw new ApiError('Failed to get file metadata', 500);
    }
  }

  /**
   * Generate presigned URL for temporary access
   */
  async generatePresignedUrl(key, expiresIn = 3600) {
    try {
      if (!this.isConfigured()) {
        throw new ApiError('S3 not configured', 500);
      }

      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn, // URL expires in seconds
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);
      
      return {
        url,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (error) {
      logger.error('Error generating presigned URL:', error, { key });
      throw new ApiError('Failed to generate presigned URL', 500);
    }
  }

  /**
   * Copy file within S3
   */
  async copyFile(sourceKey, destinationKey, options = {}) {
    try {
      if (!this.isConfigured()) {
        throw new ApiError('S3 not configured', 500);
      }

      const copyParams = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
        ACL: options.acl || 'public-read',
        MetadataDirective: 'COPY',
      };

      const result = await this.s3.copyObject(copyParams).promise();
      
      logger.info('File copied in S3', { sourceKey, destinationKey });
      
      return {
        key: destinationKey,
        url: `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${destinationKey}`,
        etag: result.CopyObjectResult.ETag,
      };
    } catch (error) {
      logger.error('Error copying file in S3:', error, { sourceKey, destinationKey });
      throw new ApiError('Failed to copy file', 500);
    }
  }

  /**
   * List files in bucket with prefix
   */
  async listFiles(prefix = '', maxKeys = 1000) {
    try {
      if (!this.isConfigured()) {
        throw new ApiError('S3 not configured', 500);
      }

      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      const result = await this.s3.listObjectsV2(params).promise();
      
      return {
        files: result.Contents.map(file => ({
          key: file.Key,
          size: file.Size,
          lastModified: file.LastModified,
          etag: file.ETag,
          url: `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${file.Key}`,
        })),
        isTruncated: result.IsTruncated,
        nextContinuationToken: result.NextContinuationToken,
      };
    } catch (error) {
      logger.error('Error listing files in S3:', error, { prefix });
      throw new ApiError('Failed to list files', 500);
    }
  }

  /**
   * Create multer upload middleware for direct S3 upload
   */
  createUploadMiddleware(options = {}) {
    if (!this.isConfigured()) {
      throw new Error('S3 not configured for upload middleware');
    }

    const {
      prefix = 'facts',
      fileSize = this.MAX_FILE_SIZE,
      fileFilter = this.defaultFileFilter.bind(this),
      metadata = () => ({}),
    } = options;

    const upload = multer({
      storage: multerS3({
        s3: this.s3,
        bucket: this.bucketName,
        acl: 'public-read',
        key: (req, file, cb) => {
          const filename = this.generateFileName(file.originalname, prefix);
          cb(null, filename);
        },
        metadata: (req, file, cb) => {
          cb(null, {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            ...metadata(req, file),
          });
        },
      }),
      limits: {
        fileSize,
      },
      fileFilter,
    });

    return upload;
  }

  /**
   * Default file filter for uploads
   */
  defaultFileFilter(req, file, cb) {
    try {
      const allowedTypes = [...this.ALLOWED_IMAGE_TYPES, ...this.ALLOWED_VIDEO_TYPES];
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ApiError(`Invalid file type: ${file.mimetype}`, 400), false);
      }
    } catch (error) {
      cb(error, false);
    }
  }

  /**
   * Get bucket statistics
   */
  async getBucketStats() {
    try {
      if (!this.isConfigured()) {
        return null;
      }

      const [factFiles, categoryIcons] = await Promise.all([
        this.listFiles('facts/'),
        this.listFiles('categories/'),
      ]);

      const totalFiles = factFiles.files.length + categoryIcons.files.length;
      const totalSize = [...factFiles.files, ...categoryIcons.files]
        .reduce((sum, file) => sum + file.size, 0);

      return {
        totalFiles,
        totalSize,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        factFiles: factFiles.files.length,
        categoryIcons: categoryIcons.files.length,
        bucketName: this.bucketName,
        region: process.env.AWS_REGION || 'us-east-1',
      };
    } catch (error) {
      logger.error('Error getting bucket stats:', error);
      return null;
    }
  }

  /**
   * Clean up old files (older than specified days)
   */
  async cleanupOldFiles(days = 90, prefix = 'temp/') {
    try {
      if (!this.isConfigured()) {
        logger.warn('S3 not configured, skipping cleanup');
        return 0;
      }

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const files = await this.listFiles(prefix);
      
      const oldFiles = files.files.filter(file => file.lastModified < cutoffDate);
      
      if (oldFiles.length === 0) {
        return 0;
      }

      const keys = oldFiles.map(file => file.key);
      await this.deleteFiles(keys);
      
      logger.info(`Cleaned up ${oldFiles.length} old files from S3`);
      return oldFiles.length;
    } catch (error) {
      logger.error('Error cleaning up old files:', error);
      return 0;
    }
  }
}

module.exports = new S3Service();
