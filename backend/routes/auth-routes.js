import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerStudent,
  resendVerificationCode,
  verifyStudentEmail,
  studentLogin,
  adminLogin,
  forgotPassword,
  verifyPasswordResetOtp,
  getPasswordResetSession,
  resetPassword,
  logout,
  getMe,
  getAppConfig
} from '../controllers/auth-controller.js';
import {
  validateStudentRegistration,
  validateForgotPassword,
  validateResetPassword,
  validateOtpRequest
} from '../middleware/validation.js';

const router = express.Router();

function createLimiter(max, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
  });
}

const registerLimiter = createLimiter(30, 'Too many registration attempts from this network. Please try again later.');
const loginLimiter = createLimiter(30, 'Too many login attempts from this network. Please try again after 15 minutes.');
const otpRequestLimiter = createLimiter(20, 'Too many code requests from this network. Please try again later.');
const otpVerifyLimiter = createLimiter(20, 'Too many code verification attempts from this network. Please try again later.');
const passwordResetLimiter = createLimiter(15, 'Too many password reset attempts from this network. Please try again later.');

router.post('/register', registerLimiter, validateStudentRegistration, registerStudent);
router.post('/verify-email', otpVerifyLimiter, validateOtpRequest, verifyStudentEmail);
router.post('/resend-verification-code', otpRequestLimiter, validateForgotPassword, resendVerificationCode);
router.post('/student/login', loginLimiter, studentLogin);
router.post('/admin/login', loginLimiter, adminLogin);
router.post('/forgot-password', otpRequestLimiter, validateForgotPassword, forgotPassword);
router.post('/verify-password-reset', otpVerifyLimiter, validateOtpRequest, verifyPasswordResetOtp);
router.get('/password-reset-session', getPasswordResetSession);
router.post('/reset-password', passwordResetLimiter, validateResetPassword, resetPassword);
router.post('/logout', logout);
router.get('/me', getMe);
router.get('/config', getAppConfig);

export default router;
