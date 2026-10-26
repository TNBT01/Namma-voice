/**
 * NAMMA VOICE - Input Validation Middleware & Helpers
 */

import { config } from '../config/config.js';
import fs from 'node:fs';
import { parseEmailAddress } from '../services/email-validation.js';
import { validatePassword } from '../services/password-policy.js';

function rejectComplaintSubmission(req, res, message) {
  if (req.file?.path) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      // Keep the validation response useful without exposing a server path.
    }
  }
  return res.status(400).json({ success: false, error: message });
}

export function isValidEmail(email) {
  return Boolean(parseEmailAddress(email));
}

export function isValidPhone(phone) {
  if (!phone) return true; // Phone is optional in some contexts
  if (typeof phone !== 'string') return false;
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

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Student full name is required (at least 2 characters).' });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  }

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid phone number.' });
  }

  if (typeof department !== 'string' || !config.academicDepartments.includes(department.trim())) {
    return res.status(400).json({ success: false, error: 'Please choose one of the supported courses.' });
  }

  if (typeof semester !== 'string' || !config.semesters.includes(semester.trim())) {
    return res.status(400).json({ success: false, error: 'Please choose a semester from 1 to 6.' });
  }

  if (req.body.student_id && (typeof req.body.student_id !== 'string' || req.body.student_id.trim().length > 40)) {
    return res.status(400).json({ success: false, error: 'College Registration Number is too long (maximum 40 characters).' });
  }

  const passwordResult = validatePassword(password, email);
  if (!passwordResult.valid) {
    return res.status(400).json({ success: false, error: passwordResult.strength.message });
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
  const { newPassword, confirmPassword } = req.body;
  const passwordResult = validatePassword(newPassword);
  if (!passwordResult.valid) {
    return res.status(400).json({ success: false, error: passwordResult.strength.message });
  }
  if (typeof confirmPassword !== 'string' || newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, error: 'New passwords do not match.' });
  }
  next();
}

export function validateOtpRequest(req, res, next) {
  const { email, otp } = req.body;
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
  }
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, error: 'Enter the six-digit verification code.' });
  }
  next();
}

/**
 * Validate Complaint Submission Payload
 */
export function validateComplaintSubmission(req, res, next) {
  const { title, description, category, location } = req.body;

  if (!title || title.trim().length < 3) {
    return rejectComplaintSubmission(req, res, 'Complaint title is required (minimum 3 characters).');
  }

  if (!description || description.trim().length < 10) {
    return rejectComplaintSubmission(req, res, 'Description must be at least 10 characters detailing the problem.');
  }

  if (!category || !config.categories.includes(category.trim())) {
    return rejectComplaintSubmission(req, res, `Invalid category. Must be one of: ${config.categories.join(', ')}`);
  }

  if (!location || location.trim().length < 2) {
    return rejectComplaintSubmission(req, res, 'Specific campus location is required.');
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
