/**
 * NAMMA VOICE - Student Routes
 */

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStudentProfile, updateStudentProfile } from '../controllers/student-controller.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('student'));

router.get('/profile', getStudentProfile);
router.patch('/profile', updateStudentProfile);

export default router;
