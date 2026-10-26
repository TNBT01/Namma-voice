import crypto from 'node:crypto';
import { get, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';
import { normalizeEmail } from './email-validation.js';
import { sendEmail } from './email-service.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_REQUESTS = 3;
const OTP_MAX_ATTEMPTS = 5;

function emailRateHash(email) {
  return crypto.createHmac('sha256', config.sessionSecret).update(`otp-email:${normalizeEmail(email)}`).digest('hex');
}

function otpHash({ otp, userType, userId, purpose }) {
  return crypto.createHmac('sha256', config.sessionSecret)
    .update(`${purpose}:${userType}:${userId}:${otp}`)
    .digest('hex');
}

export function reserveOtpRequest(email, purpose) {
  const key = emailRateHash(email);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const windowStart = new Date(nowMs - OTP_WINDOW_MS).toISOString();
  const latest = get(
    `SELECT requested_at FROM auth_otp_requests
     WHERE email_hash = ? AND purpose = ? AND requested_at >= ?
     ORDER BY requested_at DESC LIMIT 1`,
    [key, purpose, windowStart]
  );
  const count = get(
    `SELECT COUNT(*) AS count FROM auth_otp_requests
     WHERE email_hash = ? AND purpose = ? AND requested_at >= ?`,
    [key, purpose, windowStart]
  )?.count || 0;

  if (latest) {
    const sinceLatest = nowMs - Date.parse(latest.requested_at);
    if (sinceLatest < OTP_COOLDOWN_MS) {
      return { allowed: false, retryAfterSeconds: Math.ceil((OTP_COOLDOWN_MS - sinceLatest) / 1000) };
    }
  }
  if (count >= OTP_MAX_REQUESTS) {
    const oldest = get(
      `SELECT requested_at FROM auth_otp_requests
       WHERE email_hash = ? AND purpose = ? AND requested_at >= ?
       ORDER BY requested_at ASC LIMIT 1`,
      [key, purpose, windowStart]
    );
    const retryAfterSeconds = oldest ? Math.max(1, Math.ceil((Date.parse(oldest.requested_at) + OTP_WINDOW_MS - nowMs) / 1000)) : 60;
    return { allowed: false, retryAfterSeconds };
  }

  transaction(() => {
    run(`DELETE FROM auth_otp_requests WHERE requested_at < ?`, [new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()]);
    run(`INSERT INTO auth_otp_requests (email_hash, purpose, requested_at) VALUES (?, ?, ?)`, [key, purpose, now]);
  });
  return { allowed: true, retryAfterSeconds: 60 };
}

export async function issueOtp({ email, userType, userId, purpose }) {
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  let otpId;

  transaction(() => {
    run(`UPDATE auth_otps SET used = 1, consumed_at = ? WHERE user_type = ? AND user_id = ? AND purpose = ? AND used = 0`, [createdAt, userType, userId, purpose]);
    otpId = run(
      `INSERT INTO auth_otps (user_id, user_type, purpose, otp_hash, expires_at, attempts, used, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
      [userId, userType, purpose, otpHash({ otp, userType, userId, purpose }), expiresAt, createdAt]
    ).lastInsertRowid;
  });

  const verification = purpose === 'email_verification';
  const subject = verification ? 'Verify your NAMMA VOICE email' : 'NAMMA VOICE password reset code';
  const purposeText = verification ? 'verify your email address' : 'reset your password';
  const text = `Your NAMMA VOICE verification code is ${otp}. Use it to ${purposeText}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#182230"><h2>NAMMA VOICE</h2><p>Use this code to ${purposeText}:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes and can be used once.</p><p>If you did not request this, you can ignore this email.</p></div>`;

  try {
    const result = await sendEmail({ to: email, subject, text, html });
    return { accepted: true, deliveryStatus: result.status, otpId, expiresAt };
  } catch (error) {
    // Log only a fixed reason code. Never log addresses, OTPs, provider bodies,
    // credentials, or account identifiers.
    const safeReason = ['provider_rejected', 'timeout', 'network_error', 'not_configured'].includes(error?.code)
      ? error.code
      : 'delivery_failed';
    // A code that was not accepted for sending must never remain verifiable.
    run('UPDATE auth_otps SET used = 1, consumed_at = ? WHERE id = ? AND used = 0', [new Date().toISOString(), otpId]);
    if (safeReason === 'provider_rejected' && error?.diagnostics) {
      const status = Number.isInteger(error.diagnostics.httpStatus) ? error.diagnostics.httpStatus : 'unknown';
      const providerName = String(error.diagnostics.providerName || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
      const providerMessage = String(error.diagnostics.providerMessage || 'No structured provider error message was returned.')
        .replace(/[\r\n\t]+/g, ' ').slice(0, 240);
      console.warn(`NAMMA VOICE authentication email provider failure: provider_rejected http_status=${status} provider_name=${providerName} provider_message=${JSON.stringify(providerMessage)}.`);
    } else {
      console.warn(`NAMMA VOICE authentication email provider failure: ${safeReason}.`);
    }
    return { accepted: false, otpId, expiresAt, errorCode: safeReason };
  }
}

export function findOtpForEmail(email, purpose) {
  const cleanEmail = normalizeEmail(email);
  return get(
    `SELECT o.id, o.user_id, o.user_type, o.purpose, o.otp_hash, o.expires_at, o.attempts, o.used, o.created_at
     FROM auth_otps o
     WHERE o.purpose = ? AND o.used = 0 AND (
       (o.user_type = 'student' AND o.user_id = (SELECT id FROM students WHERE LOWER(TRIM(email)) = ? LIMIT 1)) OR
       (o.user_type = 'admin' AND o.user_id = (SELECT id FROM admins WHERE LOWER(TRIM(email)) = ? LIMIT 1))
     )
     ORDER BY o.id DESC LIMIT 1`,
    [purpose, cleanEmail, cleanEmail]
  );
}

export function verifyOtpRecord(record, suppliedOtp) {
  if (!record) return { valid: false, reason: 'invalid' };
  if (record.used) return { valid: false, reason: 'invalid' };
  if (Date.now() > Date.parse(record.expires_at)) {
    run(`UPDATE auth_otps SET used = 1, consumed_at = ? WHERE id = ? AND used = 0`, [new Date().toISOString(), record.id]);
    return { valid: false, reason: 'expired' };
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { valid: false, reason: 'locked' };

  const expectedHex = otpHash({ otp: suppliedOtp, userType: record.user_type, userId: record.user_id, purpose: record.purpose });
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(record.otp_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    const attempts = record.attempts + 1;
    run(
      `UPDATE auth_otps SET attempts = ?, used = ?, consumed_at = ? WHERE id = ? AND used = 0`,
      [attempts, attempts >= OTP_MAX_ATTEMPTS ? 1 : 0, attempts >= OTP_MAX_ATTEMPTS ? new Date().toISOString() : null, record.id]
    );
    return { valid: false, reason: attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid', remainingAttempts: Math.max(0, OTP_MAX_ATTEMPTS - attempts) };
  }

  const now = new Date().toISOString();
  const consumed = run(`UPDATE auth_otps SET used = 1, consumed_at = ? WHERE id = ? AND used = 0 AND attempts < ?`, [now, record.id, OTP_MAX_ATTEMPTS]);
  if (consumed.changes !== 1) return { valid: false, reason: 'invalid' };
  return { valid: true, otpId: record.id, userType: record.user_type, userId: record.user_id, expiresAt: record.expires_at };
}

export async function sendPasswordChangedNotice(email) {
  await sendEmail({
    to: email,
    subject: 'Your NAMMA VOICE password was changed',
    text: 'The password for your NAMMA VOICE account was changed. If you did not make this change, contact your college administrator.',
    html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#182230"><h2>NAMMA VOICE</h2><p>The password for your account was changed.</p><p>If you did not make this change, contact your college administrator.</p></div>'
  });
}

export default { reserveOtpRequest, issueOtp, findOtpForEmail, verifyOtpRecord, sendPasswordChangedNotice };
