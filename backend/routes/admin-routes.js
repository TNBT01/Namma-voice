/**
 * NAMMA VOICE - Administrator Routes
 */

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateComplaintUpdate } from '../middleware/validation.js';
import {
  getAdminDashboard,
  getAllComplaints,
  updateComplaint,
  getAdminProfile,
  updateAdminProfile,
  getAuditLogs
} from '../controllers/admin-controller.js';
import { getAdminComplaintById, getComplaintAttachment } from '../controllers/complaint-controller.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('admin'));

// Dashboard statistics & Chart.js data
router.get('/dashboard', getAdminDashboard);

// System Audit Logs
router.get('/audit-logs', getAuditLogs);

// Complaint administration
router.get('/complaints', getAllComplaints);
router.get('/complaints/:id/attachment', getComplaintAttachment);
router.get('/complaints/:id', getAdminComplaintById);
router.patch('/complaints/:id', validateComplaintUpdate, updateComplaint);

// Admin Profile
router.get('/profile', getAdminProfile);
router.patch('/profile', updateAdminProfile);

export default router;
