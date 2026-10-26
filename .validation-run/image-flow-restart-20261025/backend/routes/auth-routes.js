/**
 * NAMMA VOICE - Authentication Routes
 * APS College of Arts and Science
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerStudent,
  studentLogin,
  adminLogin,
  forgotPassword,
  resetPassword,
  getLatestDevResetToken,
  logout,
  getMe,
  getAppConfig
} from '../controllers/auth-controller.js';
import {
  validateStudentRegistration,
  validateForgotPassword,
  validateResetPassword
} from '../middleware/validation.js';

const router = express.Router();

// Rate limiter for login endpoints: 30 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  }
});

// Rate limiter for password resets: 10 requests per 15 minutes
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  }
});

// Auth endpoints
router.post('/register', validateStudentRegistration, registerStudent);
router.post('/student/login', loginLimiter, studentLogin);
router.post('/admin/login', loginLimiter, adminLogin);
router.post('/forgot-password', resetLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password', resetLimiter, validateResetPassword, resetPassword);
router.get('/dev/latest-reset-token', getLatestDevResetToken);
router.post('/logout', logout);
router.get('/me', getMe);
router.get('/config', getAppConfig);

export default router;
