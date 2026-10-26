/**
 * NAMMA VOICE - Authentication Controller
 * APS College of Arts and Science
 * Handles Student Registration, Student Login, Admin Login, Session Management,
 * and Cryptographically Secure Password Resets.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { get, run } from '../database/database.js';
import { config } from '../config/config.js';

// In-memory registry for local development/test password reset token retrieval
const latestDevResetTokens = new Map();

/**
 * Register a new student
 * Collects Full Name, College Registration Number, Email, Password, Department, Semester.
 * Strictly enforces uniqueness of email and registration number.
 */
export async function registerStudent(req, res, next) {
  try {
    const { name, email, phone, department, semester, password } = req.body;
    let studentId = req.body.student_id ? req.body.student_id.trim() : '';

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check for duplicate email
    const existingEmail = get('SELECT id FROM students WHERE email = ?', [cleanEmail]);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please log in or use Forgot Password.'
      });
    }

    // 2. Validate or auto-generate College Registration Number
    if (studentId) {
      const existingId = get('SELECT id FROM students WHERE student_id = ?', [studentId]);
      if (existingId) {
        return res.status(409).json({
          success: false,
          error: 'This College Registration Number is already registered. Please check your details.'
        });
      }
    } else {
      const countRes = get('SELECT COUNT(*) as count FROM students');
      const seq = (countRes ? countRes.count : 0) + 1;
      const year = new Date().getFullYear();
      studentId = `APS-${department.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${year}-${String(seq).padStart(3, '0')}`;
    }

    // 3. Hash password securely
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    // 4. Insert student into database (role is permanently 'student', is_active = 1)
    const insertRes = run(
      `INSERT INTO students (student_id, name, email, phone, department, semester, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [studentId, name.trim(), cleanEmail, phone ? phone.trim() : null, department.trim(), semester.trim(), passwordHash, now, now]
    );

    const newStudent = {
      id: insertRes.lastInsertRowid,
      student_id: studentId,
      name: name.trim(),
      email: cleanEmail,
      phone: phone ? phone.trim() : null,
      department: department.trim(),
      semester: semester.trim(),
      role: 'student'
    };

    // 5. Initialize secure session
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = newStudent;
      res.status(201).json({
        success: true,
        message: 'Student account registered successfully.',
        user: newStudent
      });
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticate student login
 */
export async function studentLogin(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both college email address and password.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const student = get('SELECT * FROM students WHERE email = ?', [cleanEmail]);

    if (!student) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email address or password.'
      });
    }

    if (student.is_active === 0) {
      return res.status(403).json({
        success: false,
        error: 'Your student account has been deactivated. Please contact the college administrator.'
      });
    }

    const passwordMatch = await bcrypt.compare(password, student.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email address or password.'
      });
    }

    const safeUser = {
      id: student.id,
      student_id: student.student_id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      department: student.department,
      semester: student.semester,
      role: 'student'
    };

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = safeUser;
      res.json({
        success: true,
        message: 'Login successful. Welcome back!',
        user: safeUser
      });
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticate administrator login
 */
export async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both administrator email and password.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const admin = get('SELECT * FROM admins WHERE email = ?', [cleanEmail]);

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid administrator credentials.'
      });
    }

    if (admin.is_active === 0) {
      return res.status(403).json({
        success: false,
        error: 'This administrator account is currently suspended. Please contact the system owner.'
      });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid administrator credentials.'
      });
    }

    const safeAdmin = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      department: admin.department,
      role: 'admin'
    };

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = safeAdmin;
      res.json({
        success: true,
        message: 'Administrator authentication successful.',
        user: safeAdmin
      });
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request Password Reset (Forgot Password)
 * Generic response to prevent account enumeration.
 * Generates single-use cryptographic token, stored hashed with SHA-256.
 */
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Check if account exists as student or admin
    const student = get('SELECT id FROM students WHERE email = ?', [cleanEmail]);
    const admin = !student ? get('SELECT id FROM admins WHERE email = ?', [cleanEmail]) : null;

    if (student || admin) {
      const userType = student ? 'student' : 'admin';
      const userId = student ? student.id : admin.id;

      // Generate cryptographically secure random token (32 bytes hex)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Expires in 20 minutes
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      // Invalidate any previous unused tokens for this user
      run(`UPDATE password_resets SET used = 1 WHERE user_id = ? AND user_type = ? AND used = 0`, [userId, userType]);

      // Insert new token hash
      run(
        `INSERT INTO password_resets (user_id, user_type, token_hash, expires_at, used, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [userId, userType, tokenHash, expiresAt, now]
      );

      // Local-only helper supports the current development/test reset flow without logging
      // account addresses or bearer tokens. Production reset delivery must use a mail provider.
      if (config.nodeEnv !== 'production') latestDevResetTokens.set(cleanEmail, rawToken);
    }

    // Always return generic confirmation
    res.json({
      success: true,
      message: 'If an account exists for that email address, password reset instructions have been issued.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Complete Password Reset with Token
 */
export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Password reset token and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const resetRecord = get(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used = 0`,
      [tokenHash]
    );

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        error: 'Password reset token is invalid or has already been used.'
      });
    }

    // Check expiration
    const now = new Date();
    const expiry = new Date(resetRecord.expires_at);
    if (now > expiry) {
      return res.status(400).json({
        success: false,
        error: 'Password reset token has expired. Please request a new password reset link.'
      });
    }

    // Hash the new password with bcrypt
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const nowIso = now.toISOString();

    if (resetRecord.user_type === 'student') {
      run(`UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?`, [
        newPasswordHash,
        nowIso,
        resetRecord.user_id
      ]);
    } else {
      run(`UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?`, [
        newPasswordHash,
        nowIso,
        resetRecord.user_id
      ]);
    }

    // Mark token as used
    run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [resetRecord.id]);

    // Invalidate existing sessions if any
    if (req.session) {
      req.session.destroy(() => {});
    }

    res.json({
      success: true,
      message: 'Your password has been successfully reset! You can now log in with your new credentials.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Developer & Test Helper: Get latest reset token for an email (non-production only)
 */
export function getLatestDevResetToken(req, res) {
  const remoteAddress = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const isLoopback = remoteAddress === '::1' || remoteAddress === '127.0.0.1' || remoteAddress.startsWith('127.');
  if (config.nodeEnv === 'production' || !isLoopback) {
    return res.status(404).json({ error: 'Not available in production' });
  }

  const email = (req.query.email || '').trim().toLowerCase();
  const token = latestDevResetTokens.get(email);

  if (!token) {
    return res.status(404).json({ success: false, error: 'No token found for this email address.' });
  }

  res.json({ success: true, token });
}

/**
 * Logout
 */
export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  });
}

/**
 * Get current session user
 */
export function getMe(req, res) {
  if (req.session && req.session.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: req.session.user
    });
  }
  return res.json({
    success: true,
    authenticated: false,
    user: null
  });
}

/**
 * App Configuration endpoint
 */
export function getAppConfig(req, res) {
  res.json({
    success: true,
    appName: config.appName,
    primarySlogan: config.primarySlogan,
    supportingTagline: config.supportingTagline,
    collegeName: config.collegeName,
    collegeLogoPath: config.collegeLogoPath,
    nammaVoiceLogoPath: config.nammaVoiceLogoPath,
    campusImages: config.campusImages,
    leadership: config.leadership,
    credits: config.credits,
    categories: config.categories,
    departments: config.departments,
    statuses: config.statuses,
    academicDepartments: config.academicDepartments,
    semesters: config.semesters
  });
}

export default {
  registerStudent,
  studentLogin,
  adminLogin,
  forgotPassword,
  resetPassword,
  getLatestDevResetToken,
  logout,
  getMe,
  getAppConfig
};
