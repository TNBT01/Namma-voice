/**
 * NAMMA VOICE - Complaint Routes
 */

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadComplaintImage } from '../middleware/upload.js';
import { validateComplaintSubmission } from '../middleware/validation.js';
import {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getComplaintAttachment
} from '../controllers/complaint-controller.js';

const router = express.Router();

router.use(requireAuth);

// Student complaint submission with optional image upload
router.post(
  '/',
  requireRole('student'),
  uploadComplaintImage.single('attachment'),
  validateComplaintSubmission,
  createComplaint
);

// Student personal complaints list
router.get('/my', requireRole('student'), getMyComplaints);

// Private attachments and complaint details are available to the owning student.
router.get('/:id/attachment', requireRole('student'), getComplaintAttachment);
router.get('/:id', requireRole('student'), getComplaintById);

export default router;
