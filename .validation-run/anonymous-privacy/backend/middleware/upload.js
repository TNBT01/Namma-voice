/**
 * NAMMA VOICE - File Upload Middleware
 * Configures Multer for secure complaint attachments and academic PDF uploads.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { config } from '../config/config.js';

// Ensure upload directories exist
for (const p of [config.paths.complaintUploads, config.paths.resourceUploads]) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

/**
 * Storage engine for complaint image attachments
 */
const complaintStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.paths.complaintUploads);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `complaint_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const imageFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, PNG, and WebP images are permitted for complaint attachments.'));
  }
};

export const uploadComplaintImage = multer({
  storage: complaintStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: imageFilter
});

/**
 * Storage engine for academic PDF resource uploads
 */
const resourceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.paths.resourceUploads);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `resource_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const resourceFilter = (req, file, cb) => {
  const allowedExts = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid resource format. Allowed formats: PDF, DOCX, PPTX, DOC, PPT, TXT (up to 15MB).'));
  }
};

export const uploadAcademicResource = multer({
  storage: resourceStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: resourceFilter
});

export default {
  uploadComplaintImage,
  uploadAcademicResource
};
