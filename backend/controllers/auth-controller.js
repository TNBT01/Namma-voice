import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { get, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';
import { normalizeEmail, validateEmailDomain } from '../services/email-validation.js';
import { isEmailDeliveryConfigured } from '../services/email-service.js';
import { reserveOtpRequest, issueOtp, findOtpForEmail, verifyOtpRecord, sendPasswordChangedNotice } from '../services/otp-service.js';
import { validatePassword } from '../services/password-policy.js';

const genericResetMessage = 'If an eligible account exists, a one-time code request will be processed. This response does not confirm provider acceptance or final email delivery.';
const genericVerificationMessage = 'If an unverified student account exists, a code request will be processed. This response does not confirm provider acceptance or final email delivery.';
const emailUnavailableResponse = {
  success: false,
  code: 'EMAIL_DELIVERY_UNAVAILABLE',
  error: 'Email delivery is not configured or currently unavailable. Please contact the NAMMA VOICE administrator.'
};
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

function safeStudent(student) {
  return {
    id: student.id,
    student_id: student.student_id,
    name: student.name,
    email: student.email,
    phone: student.phone,
    department: student.department,
    semester: student.semester,
    role: 'student'
  };
}

function safeAdmin(admin) {
  return { id: admin.id, name: admin.name, email: admin.email, department: admin.department, role: 'admin' };
}

function establishSession(req, res, next, user, authVersion, status = 200, message = 'Login successful.') {
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.user = user;
    req.session.authVersion = Number(authVersion || 0);
    req.session.save(saveError => {
      if (saveError) return next(saveError);
      res.status(status).json({ success: true, message, user });
    });
  });
}

function accountForEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const student = get('SELECT id, email, is_active, email_verified FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1', [cleanEmail]);
  if (student) return { ...student, user_type: 'student' };
  const admin = get('SELECT id, email, is_active FROM admins WHERE LOWER(TRIM(email)) = ? LIMIT 1', [cleanEmail]);
  return admin ? { ...admin, user_type: 'admin' } : null;
}

function verificationError(res, reason) {
  if (reason === 'expired') {
    return res.status(410).json({ success: false, code: 'OTP_EXPIRED', error: 'That code has expired. Request a new code and try again.' });
  }
  if (reason === 'locked') {
    return res.status(429).json({ success: false, code: 'OTP_ATTEMPTS_EXCEEDED', error: 'Too many incorrect codes. Request a new code to continue.' });
  }
  return res.status(400).json({ success: false, code: 'OTP_INVALID', error: 'The code is incorrect or has already been used.' });
}

/** Create a student account, optionally requiring email verification by config. */
export async function registerStudent(req, res, next) {
  try {
    const { name, email, phone, department, semester, password } = req.body;
    const address = normalizeEmail(email);
    const emailCheck = await validateEmailDomain(address);
    if (!emailCheck.valid) {
      if (emailCheck.reason === 'dns_unavailable') {
        return res.status(503).json({ success: false, error: 'We could not check this email domain right now. Please try again shortly.' });
      }
      if (emailCheck.reason === 'domain_not_allowed') {
        return res.status(400).json({ success: false, error: 'This email domain is not enabled for student registration.' });
      }
      return res.status(400).json({ success: false, error: 'Enter an email address with a working mail domain.' });
    }
    const requiresEmailVerification = config.auth.emailVerificationEnabled;
    if (requiresEmailVerification && !isEmailDeliveryConfigured()) {
      return res.status(503).json({ success: false, error: 'Email verification is temporarily unavailable. Please try again later.' });
    }
    const existingEmail = get('SELECT id FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1', [address]);
    if (existingEmail) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Sign in if this is your account. Contact an administrator if you need help.' });
    }

    let studentId = typeof req.body.student_id === 'string' ? req.body.student_id.trim() : '';
    if (studentId) {
      const existingId = get('SELECT id FROM students WHERE LOWER(TRIM(student_id)) = LOWER(TRIM(?)) LIMIT 1', [studentId]);
      if (existingId) {
        return res.status(409).json({ success: false, error: 'This College Registration Number is already registered.' });
      }
    } else {
      const countRes = get('SELECT COUNT(*) AS count FROM students');
      const year = new Date().getFullYear();
      studentId = `APS-${department.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${year}-${String((countRes?.count || 0) + 1).padStart(3, '0')}`;
      const collision = get('SELECT id FROM students WHERE LOWER(TRIM(student_id)) = LOWER(TRIM(?))', [studentId]);
      if (collision) studentId = `${studentId}-${Date.now().toString(36).toUpperCase()}`;
    }

    // This registration OTP block is retained behind the temporary feature switch.
    if (requiresEmailVerification) {
      const reservation = reserveOtpRequest(address, 'email_verification');
      if (!reservation.allowed) {
        return res.status(429).json({ success: false, error: `Please wait ${reservation.retryAfterSeconds} seconds before requesting another code.` });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const insert = run(
      `INSERT INTO students (student_id, name, email, phone, department, semester, password_hash, is_active, email_verified, session_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)`,
      [studentId, name.trim(), address, phone ? phone.trim() : null, department, semester, passwordHash, requiresEmailVerification ? 0 : 1, now, now]
    );

    if (requiresEmailVerification) {
      const delivery = await issueOtp({ email: address, userType: 'student', userId: insert.lastInsertRowid, purpose: 'email_verification' });
      if (!delivery.accepted) {
        return res.status(502).json({
          success: false,
          code: 'VERIFICATION_EMAIL_FAILED',
          deliveryStatus: 'failed',
          error: 'Your account is saved, but the email provider did not accept the verification message. Wait for the resend cooldown, then request a new code.'
        });
      }

      const acceptedByTestTransport = delivery.deliveryStatus === 'test_transport_accepted';
      return res.status(201).json({
        success: true,
        message: acceptedByTestTransport
          ? 'Test transport accepted the verification message.'
          : 'Account created. The email provider accepted the verification message; final inbox delivery is not confirmed. Check your inbox and spam folder.',
        deliveryStatus: delivery.deliveryStatus,
        verificationRequired: true,
        user: { id: insert.lastInsertRowid, student_id: studentId, role: 'student' }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful. You can now log in.',
      user: { id: insert.lastInsertRowid, student_id: studentId, role: 'student' }
    });
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'An account with these registration details already exists.' });
    }
    next(error);
  }
}

export async function resendVerificationCode(req, res, next) {
  try {
    if (!config.auth.emailVerificationEnabled) {
      return res.status(410).json({
        success: false,
        code: 'EMAIL_VERIFICATION_DISABLED',
        error: 'Email verification is temporarily disabled.'
      });
    }
    const email = normalizeEmail(req.body.email);
    if (!isEmailDeliveryConfigured()) return res.status(503).json(emailUnavailableResponse);
    const reservation = reserveOtpRequest(email, 'email_verification');
    if (!reservation.allowed) {
      res.set('Retry-After', String(reservation.retryAfterSeconds));
      return res.status(429).json({ success: false, error: `Please wait ${reservation.retryAfterSeconds} seconds before requesting another code.` });
    }

    const student = get('SELECT id, email, is_active, email_verified FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1', [email]);
    if (student && student.is_active === 1 && student.email_verified !== 1 && isEmailDeliveryConfigured()) {
      await issueOtp({ email: student.email, userType: 'student', userId: student.id, purpose: 'email_verification' });
    }
    return res.status(202).json({ success: true, deliveryStatus: 'not_confirmed', message: genericVerificationMessage });
  } catch (error) {
    next(error);
  }
}

export function verifyStudentEmail(req, res, next) {
  try {
    if (!config.auth.emailVerificationEnabled) {
      return res.status(410).json({
        success: false,
        code: 'EMAIL_VERIFICATION_DISABLED',
        error: 'Email verification is temporarily disabled.'
      });
    }
    const email = normalizeEmail(req.body.email);
    const student = get('SELECT id, is_active, email_verified FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1', [email]);
    if (!student || student.is_active !== 1) return verificationError(res, 'invalid');
    if (student.email_verified === 1) {
      return verificationError(res, 'invalid');
    }

    const record = findOtpForEmail(email, 'email_verification');
    const result = verifyOtpRecord(record, req.body.otp);
    if (!result.valid) return verificationError(res, result.reason);

    run('UPDATE students SET email_verified = 1, session_version = session_version + 1, updated_at = ? WHERE id = ? AND is_active = 1', [new Date().toISOString(), student.id]);
    return res.json({ success: true, message: 'Email verified. You can now sign in to NAMMA VOICE.' });
  } catch (error) {
    next(error);
  }
}

export async function studentLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide both your email address and password.' });
    }

    const student = get('SELECT * FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1', [normalizeEmail(email)]);
    const passwordMatch = await bcrypt.compare(password, student?.password_hash || dummyPasswordHash);
    if (!student || !passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email address or password.' });
    }
    if (student.is_active === 0) {
      return res.status(403).json({ success: false, error: 'Your student account is inactive. Please contact the college administrator.' });
    }
    if (config.auth.emailVerificationEnabled && student.email_verified !== 1) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Verify your email before signing in. You can request a code from the Verify Email page.'
      });
    }

    if (bcrypt.getRounds(student.password_hash) < 12) {
      const upgradedHash = await bcrypt.hash(password, 12);
      run('UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?', [upgradedHash, new Date().toISOString(), student.id]);
    }

    return establishSession(req, res, next, safeStudent(student), student.session_version, 200, 'Login successful. Welcome back!');
  } catch (error) {
    next(error);
  }
}

export async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide both administrator email and password.' });
    }
    const admin = get('SELECT * FROM admins WHERE LOWER(TRIM(email)) = ? LIMIT 1', [normalizeEmail(email)]);
    const passwordMatch = await bcrypt.compare(password, admin?.password_hash || dummyPasswordHash);
    if (!admin || !passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid administrator credentials.' });
    }
    if (admin.is_active === 0) {
      return res.status(403).json({ success: false, error: 'This administrator account is currently suspended.' });
    }
    if (bcrypt.getRounds(admin.password_hash) < 12) {
      const upgradedHash = await bcrypt.hash(password, 12);
      run('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?', [upgradedHash, new Date().toISOString(), admin.id]);
    }
    return establishSession(req, res, next, safeAdmin(admin), admin.session_version, 200, 'Administrator authentication successful.');
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isEmailDeliveryConfigured()) return res.status(503).json(emailUnavailableResponse);
    const reservation = reserveOtpRequest(email, 'password_reset');
    if (!reservation.allowed) {
      res.set('Retry-After', String(reservation.retryAfterSeconds));
      return res.status(429).json({ success: false, error: `Please wait ${reservation.retryAfterSeconds} seconds before requesting another code.` });
    }

    const account = accountForEmail(email);
    const eligible = account && account.is_active === 1 && (account.user_type === 'admin' || account.email_verified === 1);
    if (eligible && isEmailDeliveryConfigured()) {
      await issueOtp({ email: account.email, userType: account.user_type, userId: account.id, purpose: 'password_reset' });
    }
    return res.status(202).json({ success: true, deliveryStatus: 'not_confirmed', message: genericResetMessage });
  } catch (error) {
    next(error);
  }
}

export function verifyPasswordResetOtp(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const record = findOtpForEmail(email, 'password_reset');
    const result = verifyOtpRecord(record, req.body.otp);
    if (!result.valid) return verificationError(res, result.reason);

    const table = result.userType === 'student' ? 'students' : 'admins';
    const account = get(`SELECT id, email, is_active, session_version${result.userType === 'student' ? ', email_verified' : ''} FROM ${table} WHERE id = ?`, [result.userId]);
    if (!account || account.is_active !== 1 || (result.userType === 'student' && account.email_verified !== 1)) {
      return verificationError(res, 'invalid');
    }

    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.passwordResetGrant = {
        userType: result.userType,
        userId: result.userId,
        otpId: result.otpId,
        expiresAt: Math.min(Date.parse(result.expiresAt), Date.now() + 10 * 60 * 1000)
      };
      req.session.save(saveError => {
        if (saveError) return next(saveError);
        res.json({ success: true, message: 'Code verified. Choose a new password to finish resetting your account.' });
      });
    });
  } catch (error) {
    next(error);
  }
}

export function getPasswordResetSession(req, res) {
  const grant = req.session?.passwordResetGrant;
  const authorized = Boolean(grant && grant.expiresAt > Date.now());
  res.json({ success: true, authorized });
}

export async function resetPassword(req, res, next) {
  try {
    const grant = req.session?.passwordResetGrant;
    if (!grant || grant.expiresAt <= Date.now()) {
      return res.status(401).json({ success: false, error: 'Verify a current email code before changing your password.' });
    }

    const table = grant.userType === 'student' ? 'students' : grant.userType === 'admin' ? 'admins' : null;
    if (!table) return res.status(401).json({ success: false, error: 'Verify a current email code before changing your password.' });
    const consumedOtp = get('SELECT id FROM auth_otps WHERE id = ? AND user_id = ? AND user_type = ? AND purpose = ? AND used = 1 AND reset_completed = 0 AND consumed_at IS NOT NULL', [grant.otpId, grant.userId, grant.userType, 'password_reset']);
    if (!consumedOtp) return res.status(401).json({ success: false, error: 'Verify a current email code before changing your password.' });

    const account = get(`SELECT id, email, is_active FROM ${table} WHERE id = ?`, [grant.userId]);
    if (!account || account.is_active !== 1) return res.status(401).json({ success: false, error: 'This account cannot reset its password.' });
    const passwordPolicy = validatePassword(req.body.newPassword, account.email);
    if (!passwordPolicy.valid) return res.status(400).json({ success: false, error: passwordPolicy.strength.message });

    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    const now = new Date().toISOString();
    transaction(() => {
      const result = run(`UPDATE ${table} SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ? AND is_active = 1`, [passwordHash, now, grant.userId]);
      if (result.changes !== 1) throw new Error('Password update could not be completed.');
      const resetUsed = run(`UPDATE auth_otps SET reset_completed = 1 WHERE id = ? AND reset_completed = 0`, [grant.otpId]);
      if (resetUsed.changes !== 1) throw new Error('Password reset authorization has already been used.');
    });

    let noticeSent = true;
    try {
      await sendPasswordChangedNotice(account.email);
    } catch {
      noticeSent = false;
      console.warn('NAMMA VOICE password change notification could not be delivered.');
    }

    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('namma_voice_sid');
      res.json({
        success: true,
        message: noticeSent
          ? 'Password changed successfully. Sign in with your new password.'
          : 'Password changed successfully, but the security notification could not be delivered. Sign in with your new password.'
      });
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res, next) {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('namma_voice_sid');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
}

function activeSessionAccount(req) {
  const user = req.session?.user;
  if (!user || !['student', 'admin'].includes(user.role)) return null;
  const table = user.role === 'student' ? 'students' : 'admins';
  const fields = user.role === 'student' ? 'id, is_active, email_verified, session_version' : 'id, is_active, session_version';
  const account = get(`SELECT ${fields} FROM ${table} WHERE id = ?`, [user.id]);
  if (!account || account.is_active !== 1 || (config.auth.emailVerificationEnabled && user.role === 'student' && account.email_verified !== 1)) return null;
  if (Number(req.session.authVersion) !== Number(account.session_version)) return null;
  return user;
}

export function getMe(req, res) {
  const user = activeSessionAccount(req);
  if (user) return res.json({ success: true, authenticated: true, user });
  if (req.session?.user) {
    req.session.destroy(() => {});
    res.clearCookie('namma_voice_sid');
  }
  return res.json({ success: true, authenticated: false, user: null });
}

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
};
