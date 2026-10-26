/**
 * NAMMA VOICE - Input Validation Middleware & Helpers
 */

import { config } from '../config/config.js';

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim().toLowerCase());
}

export function isValidPhone(phone) {
  if (!phone) return true; // Phone is optional in some contexts
  const re = /^[0-9+-\s()]{7,15}$/;
  return re.test(phone.trim());
}

export function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim();
}

/**
 * Validate Student Registration Payload
 */
export function validateStudentRegistration(req, res, next) {
  const { name, email, phone, department, semester, password, confirmPassword } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Student full name is required (at least 2 characters).' });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  }

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid phone number.' });
  }

  if (!department || department.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Department is required.' });
  }

  if (!semester || semester.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Semester/Year is required.' });
  }

  if (req.body.student_id && req.body.student_id.trim().length > 40) {
    return res.status(400).json({ success: false, error: 'College Registration Number is too long (maximum 40 characters).' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, error: 'Passwords do not match.' });
  }

  next();
}

/**
 * Validate Forgot Password Request Payload
 */
export function validateForgotPassword(req, res, next) {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }
  next();
}

/**
 * Validate Reset Password Request Payload
 */
export function validateResetPassword(req, res, next) {
  const { token, newPassword, confirmPassword } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, error: 'A valid password reset token is required.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
  }
  if (confirmPassword && newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, error: 'New passwords do not match.' });
  }
  next();
}

/**
 * Validate Complaint Submission Payload
 */
export function validateComplaintSubmission(req, res, next) {
  const { title, description, category, location } = req.body;

  if (!title || title.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'Complaint title is required (minimum 3 characters).' });
  }

  if (!description || description.trim().length < 10) {
    return res.status(400).json({ success: false, error: 'Description must be at least 10 characters detailing the problem.' });
  }

  if (!category || !config.categories.includes(category.trim())) {
    return res.status(400).json({
      success: false,
      error: `Invalid category. Must be one of: ${config.categories.join(', ')}`
    });
  }

  if (!location || location.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Specific campus location is required.' });
  }

  next();
}

/**
 * Validate Complaint Status & Department Update by Admin
 */
export function validateComplaintUpdate(req, res, next) {
  const { status, assigned_department, admin_remarks } = req.body;

  if (status && !config.statuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${config.statuses.join(', ')}`
    });
  }

  if (assigned_department && !config.departments.includes(assigned_department)) {
    return res.status(400).json({
      success: false,
      error: `Invalid department. Must be one of: ${config.departments.join(', ')}`
    });
  }

  next();
}
