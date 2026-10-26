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
  getComplaintById
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

// View complaint details (accessible by owner student or admin)
router.get('/:id', getComplaintById);

export default router;
