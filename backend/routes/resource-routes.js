/**
 * NAMMA VOICE - Academic Resources Routes
 */

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadAcademicResource } from '../middleware/upload.js';
import {
  getResources,
  downloadResource,
  uploadResource,
  updateResource,
  deleteResource
} from '../controllers/resource-controller.js';

const router = express.Router();

// Public / student viewing of resources
router.get('/', getResources);
router.get('/:id/download', downloadResource);

// Admin-only management routes
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  uploadAcademicResource.single('file'),
  uploadResource
);

router.patch('/:id', requireAuth, requireRole('admin'), updateResource);
router.delete('/:id', requireAuth, requireRole('admin'), deleteResource);

export default router;
