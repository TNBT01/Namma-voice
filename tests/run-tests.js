/**
 * NAMMA VOICE - Automated Test Suite
 * APS College of Arts and Science
 *
 * Verifies:
 * 1. Health check & Required static pages (including forgot/reset password).
 * 2. Complete absence of demo credentials and autofill buttons in HTML/API.
 * 3. Permanent student registration with custom and auto-generated registration numbers.
 * 4. Duplicate email rejection (409) and duplicate registration number rejection (409).
 * 5. Secure administrator creation through admin setup script/utility.
 * 6. Protection of administrative endpoints against student or unauthenticated access (401/403).
 * 7. Prevention of role escalation through public registration.
 * 8. Administrative student management (account search, activation/deactivation, audit logging).
 * 9. Deactivated account rejection on login (403).
 * 10. Complaint lifecycle (submission, routing, In Progress, audit history, Resolved).
 * 11. Academic resource repository listing and PDF downloading.
 * 12. Password reset flow (generic confirmation, secure token hashing, expiration, single-use, session invalidation).
 * 13. Password and secret isolation (password hashes are never exposed via API).
 * 14. SQLite persistence and safe migrations.
 * 15. Database backup utility execution.
 */

import http from 'http';
import { spawn } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import { app } from '../backend/app.js';
import { createSchema } from '../backend/database/init-db.js';
import { seedDatabase } from '../backend/database/seed.js';
import { get, query, run } from '../backend/database/database.js';
import { createAdminAccount } from '../backend/scripts/create-admin.js';
import { createDatabaseBackup } from '../backend/scripts/backup-db.js';
import { config } from '../backend/config/config.js';
import { sendEmail, setTestEmailTransport } from '../backend/services/email-service.js';
import { issueOtp } from '../backend/services/otp-service.js';

const testEmailOutbox = globalThis.__NAMMA_TEST_EMAIL_OUTBOX || [];
const captureTestEmail = message => {
  if (globalThis.__NAMMA_TEST_EMAIL_FAILURES?.has(message.to)) throw new Error('Simulated delivery failure.');
  testEmailOutbox.push(message);
};
if (config.nodeEnv === 'test') setTestEmailTransport(captureTestEmail);

let server;
let baseUrl = '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function complaintHasStudentIdentity(record) {
  const forbiddenKeys = ['student_id', 'student_name', 'student_email', 'student_phone', 'student_registration_number', 'student_department', 'student_profile'];
  return forbiddenKeys.some(key => Object.hasOwn(record || {}, key));
}

async function request(urlPath, options = {}) {
  const url = `${baseUrl}${urlPath}`;
  const headers = { ...options.headers };
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
    redirect: 'manual'
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  const cookie = res.headers.get('set-cookie');
  return { status: res.status, headers: res.headers, data, cookie };
}

async function withResendResponse(responseFactory, callback, fromAddress = 'verified-test-sender@example.test') {
  const originalFetch = globalThis.fetch;
  const originalEmailConfig = { ...config.email };
  setTestEmailTransport(null);
  config.email.provider = 'resend';
  config.email.resendApiKey = 'test-only-api-key';
  config.email.fromAddress = fromAddress;
  config.email.fromName = 'NAMMA VOICE';
  globalThis.fetch = (url, options) => String(url) === 'https://api.resend.com/emails'
    ? responseFactory(url, options)
    : originalFetch(url, options);
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config.email, originalEmailConfig);
    setTestEmailTransport(captureTestEmail);
  }
}

async function withStudentEmailVerificationEnabled(callback) {
  const originalSetting = config.auth.emailVerificationEnabled;
  config.auth.emailVerificationEnabled = true;
  try {
    return await callback();
  } finally {
    config.auth.emailVerificationEnabled = originalSetting;
  }
}

async function captureFailure(callback) {
  try {
    return { result: await callback(), error: null };
  } catch (error) {
    return { result: null, error };
  }
}

function latestOtp(email, subjectPart) {
  const message = [...testEmailOutbox].reverse().find(item => item.to === email && item.subject.includes(subjectPart));
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`Automated test email was not captured for ${subjectPart}.`);
  return code;
}

async function verifyAttachmentAfterProcessRestart(complaintId, adminEmail, adminPassword) {
  const portProbe = http.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));

  // The isolated test database has already passed createSchema/seed checks;
  // restart only the server and persisted database loader for this assertion.
  const child = spawn(process.execPath, ['backend/server.js', '--skip-db-bootstrap'], {
    cwd: config.paths.root,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      DATABASE_PATH: process.env.DATABASE_PATH || 'database/namma_voice.sqlite',
      SESSION_SECRET: config.sessionSecret,
      PORT: String(port)
    },
    stdio: 'ignore'
  });
  const origin = `http://127.0.0.1:${port}`;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const health = await fetch(`${origin}/api/health`);
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {
        // The new process is still initializing its persisted database.
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) return { status: 0, contentType: '', bytes: 0 };

    const login = await fetch(`${origin}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const attachment = await fetch(`${origin}/api/admin/complaints/${encodeURIComponent(complaintId)}/attachment`, {
      headers: { Cookie: cookie }
    });
    const bytes = await attachment.arrayBuffer();
    return {
      status: attachment.status,
      contentType: attachment.headers.get('content-type') || '',
      bytes: bytes.byteLength
    };
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(' NAMMA VOICE - COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log(' APS College of Arts and Science');
  console.log('====================================================\n');

  // 1. Initialize SQLite Database Schema & Seeds
  await createSchema();
  await seedDatabase();

  // 2. Start HTTP Server on an ephemeral port
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`Test server running on ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // TEST GROUP 0: RESEND API CONTRACT & SAFE DIAGNOSTICS
    // ----------------------------------------------------
    console.log('--- TEST GROUP 0: RESEND API CONTRACT & SAFE DIAGNOSTICS ---');
    let acceptedRequest = null;
    const acceptedSend = await withResendResponse(async (url, options) => {
      acceptedRequest = { url, method: options.method, authorization: options.headers.Authorization, contentType: options.headers['Content-Type'], payload: JSON.parse(options.body) };
      return new Response(JSON.stringify({ id: 'email_test_accepted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }, () => sendEmail({ to: 'student-recipient@example.test', subject: 'Test subject', text: 'Test body', html: '<p>Test body</p>' }), 'onboarding@resend.dev');
    assert(acceptedSend.status === 'provider_accepted', 'A successful Resend HTTP response is reported as provider accepted');
    assert(acceptedRequest.url === 'https://api.resend.com/emails' && acceptedRequest.method === 'POST' && acceptedRequest.contentType === 'application/json', 'Resend is called with POST JSON at the correct API URL');
    assert(acceptedRequest.payload.from === 'NAMMA VOICE <onboarding@resend.dev>' && JSON.stringify(acceptedRequest.payload.to) === JSON.stringify(['student-recipient@example.test']), 'Configured sender and OTP recipient are passed to Resend in the expected fields');
    assert(acceptedRequest.authorization === 'Bearer test-only-api-key', 'Resend bearer authorization uses the configured API key');

    const invalidApiKey = await captureFailure(() => withResendResponse(
      async () => new Response(JSON.stringify({ name: 'authentication_error', message: 'Invalid API key: re_FAKEKEY1234567890 for student@example.test; OTP 123456.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
      () => sendEmail({ to: 'student@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' })
    ));
    assert(invalidApiKey.error?.code === 'provider_rejected' && invalidApiKey.error.diagnostics.httpStatus === 401 && invalidApiKey.error.diagnostics.providerName === 'authentication_error', 'Invalid API-key response keeps its HTTP status and provider error name');
    assert(!invalidApiKey.error.diagnostics.providerMessage.includes('re_FAKEKEY') && !invalidApiKey.error.diagnostics.providerMessage.includes('student@example.test') && !invalidApiKey.error.diagnostics.providerMessage.includes('123456'), 'Provider diagnostics redact API-key-like values, addresses, and six-digit codes');

    let unverifiedSenderPayload = null;
    const unverifiedSender = await captureFailure(() => withResendResponse(async (_url, options) => {
      unverifiedSenderPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({ name: 'validation_error', message: 'The sender onboarding@resend.dev has not been verified.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }, () => sendEmail({ to: 'owner@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' }), 'onboarding@resend.dev'));
    assert(unverifiedSender.error?.diagnostics.httpStatus === 403 && unverifiedSender.error.diagnostics.providerName === 'validation_error', 'Unverified sender rejection is preserved in safe diagnostics');
    assert(unverifiedSenderPayload.from === 'NAMMA VOICE <onboarding@resend.dev>', 'Resend receives the configured onboarding test sender exactly');

    let restrictedRecipientPayload = null;
    const restrictedRecipient = await captureFailure(() => withResendResponse(async (_url, options) => {
      restrictedRecipientPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({ name: 'validation_error', message: 'Test mode only permits delivery to account.owner@example.com.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }, () => sendEmail({ to: 'another-student@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' }), 'onboarding@resend.dev'));
    assert(restrictedRecipient.error?.diagnostics.httpStatus === 403 && restrictedRecipientPayload.to[0] === 'another-student@example.test', 'Restricted test-recipient rejection identifies the correct recipient request without logging its address');

    const providerRejected = await captureFailure(() => withResendResponse(
      async () => new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'Provider rejected the request.' }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
      () => sendEmail({ to: 'student@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' })
    ));
    assert(providerRejected.error?.diagnostics.httpStatus === 429 && providerRejected.error.diagnostics.providerMessage === 'Provider rejected the request.', 'General provider rejection preserves a bounded safe message and status');

    const originalConsoleError = console.error;
    let capturedEmailServiceLog = '';
    let loggedProviderRejection;
    console.error = message => { capturedEmailServiceLog += String(message); };
    try {
      loggedProviderRejection = await captureFailure(() => withResendResponse(
        async () => new Response(JSON.stringify({
          name: 'authentication_error',
          message: `Invalid API key: re_EMAILSECRET1234567890 for student@example.test; OTP 654321; password=SensitivePass; SESSION_SECRET=${config.sessionSecret}; credential test-only-api-key`
        }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
        () => sendEmail({ to: 'student@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' })
      ));
    } finally {
      console.error = originalConsoleError;
    }
    assert(loggedProviderRejection.error?.code === 'provider_rejected', 'Email service surfaces provider rejection through its existing error path');
    assert(capturedEmailServiceLog.includes('Email send failed (401):') && capturedEmailServiceLog.includes('Invalid API key'), 'Email service logs provider HTTP status and a safe error message');
    assert(!capturedEmailServiceLog.includes('re_EMAILSECRET') && !capturedEmailServiceLog.includes('test-only-api-key') && !capturedEmailServiceLog.includes(config.sessionSecret) && !capturedEmailServiceLog.includes('student@example.test') && !capturedEmailServiceLog.includes('654321') && !capturedEmailServiceLog.includes('SensitivePass'), 'Email diagnostics never log API keys, addresses, OTPs, passwords, or session secrets');

    // ----------------------------------------------------
    // TEST GROUP 1: HEALTH CHECK & REQUIRED PAGES
    // ----------------------------------------------------
    console.log('--- TEST GROUP 1: HEALTH CHECK & REQUIRED PAGES ---');
    assert(config.auth.emailVerificationEnabled === false, 'Registration email verification is disabled by the test environment flag');
    const health = await request('/api/health');
    assert(health.status === 200 && health.data.status === 'healthy', 'Health check API returns 200 OK and healthy status');
    assert(get('SELECT COUNT(*) AS count FROM complaints').count === 0, 'Startup seed does not create complaint records');
    assert(get('SELECT COUNT(*) AS count FROM admins').count === 0, 'Startup seed does not create a default administrator account');
    const resendWrongMethod = await request('/api/auth/resend-verification-code');
    const resendUnknownPath = await request('/api/auth/resend-verification', { method: 'POST', body: { email: 'someone@example.com' } });
    const resendMissingEmail = await request('/api/auth/resend-verification-code', { method: 'POST', body: {} });
    assert(resendWrongMethod.status === 404, 'Registration resend route rejects the wrong HTTP method');
    assert(resendUnknownPath.status === 404, 'Unknown OTP endpoint returns HTTP 404');
    assert(resendMissingEmail.status === 400, 'Registration resend route validates the exact JSON email field');

    const requiredPages = [
      'index.html',
      '404.html',
      'about.html',
      'courses.html',
      'student-login.html',
      'student-register.html',
      'admin-login.html',
      'forgot-password.html',
      'reset-password.html',
      'verify-email.html',
      'resources.html',
      'student-dashboard.html',
      'submit-complaint.html',
      'my-complaints.html',
      'student-complaint-details.html',
      'student-profile.html',
      'admin-dashboard.html',
      'complaint-management.html',
      'admin-complaint-details.html',
      'admin-profile.html'
    ];

    for (const page of requiredPages) {
      const filePath = path.resolve(`public/${page}`);
      assert(fs.existsSync(filePath), `Required page exists: public/${page}`);
    }

    const homePage = await request('/');
    assert(homePage.status === 200 && homePage.data.includes('<title>NAMMA VOICE | APS College of Arts and Science</title>'), 'Homepage is served with its public SEO title');
    const canonicalUrl = homePage.data.match(/rel="canonical" href="([^"]+)"/)?.[1] || '';
    assert(canonicalUrl.startsWith('http') && !canonicalUrl.includes('__CANONICAL_URL__'), 'Homepage canonical is rendered from the configured site URL');
    const sitemap = await request('/sitemap.xml');
    assert(sitemap.status === 200 && sitemap.data.includes('/about.html') && !sitemap.data.includes('admin-dashboard'), 'Sitemap contains public pages only');
    const robots = await request('/robots.txt');
    assert(robots.status === 200 && robots.data.includes('Disallow: /api/'), 'robots.txt excludes API routes from crawling');
    const notFound = await request('/route-that-does-not-exist', { headers: { Accept: 'text/html' } });
    assert(notFound.status === 404 && String(notFound.data).includes("We couldn't find that page"), 'Unknown public route serves custom 404 with HTTP 404');
    const verifyPage = await request('/verify-email.html');
    assert(verifyPage.status === 200 && verifyPage.headers.get('x-robots-tag')?.includes('noindex'), 'Email verification page is served and excluded from search indexing');
    assert(verifyPage.data.includes('data-email-verification-enabled="false"') && /id="email-verification-controls" hidden/.test(verifyPage.data), 'Verification and resend controls render hidden while registration OTP is disabled');
    const enabledVerifyPage = await withStudentEmailVerificationEnabled(() => request('/verify-email.html'));
    assert(enabledVerifyPage.data.includes('data-email-verification-enabled="true"'), 'The same configuration switch reactivates the retained verification UI');
    const registrationHtml = fs.readFileSync(path.resolve('public/student-register.html'), 'utf-8');
    const loginHtml = fs.readFileSync(path.resolve('public/student-login.html'), 'utf-8');
    assert(/type="email"[^>]*required/.test(registrationHtml), 'Student registration requires a browser-validated email address');
    assert(!registrationHtml.includes('/verify-email.html') && !loginHtml.includes('/verify-email.html'), 'Registration and login pages no longer link to email verification');
    assert(!verifyPage.data.includes('email provider did not accept') && verifyPage.data.includes('Email verification is temporarily disabled.'), 'Disabled verification UI contains no email-delivery failure message');

    // ----------------------------------------------------
    // TEST GROUP 2: REMOVAL OF DEMO CREDENTIALS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: REMOVAL OF DEMO CREDENTIALS ---');
    const studentLoginHtml = fs.readFileSync(path.resolve('public/student-login.html'), 'utf-8');
    const studentRegisterHtml = fs.readFileSync(path.resolve('public/student-register.html'), 'utf-8');
    const adminLoginHtml = fs.readFileSync(path.resolve('public/admin-login.html'), 'utf-8');

    assert(!studentLoginHtml.includes('btn-fill-student-demo'), 'No demo autofill button in student-login.html');
    assert(!studentLoginHtml.includes('demo-credentials-box'), 'No demo credentials box in student-login.html');
    assert(!studentRegisterHtml.includes('/verify-email.html'), 'Student registration does not direct users to email verification');
    assert(!adminLoginHtml.includes('btn-fill-admin-demo'), 'No demo autofill button in admin-login.html');
    assert(!adminLoginHtml.includes('demo-credentials-box'), 'No demo credentials box in admin-login.html');

    // ----------------------------------------------------
    // TEST GROUP 3: STUDENT REGISTRATION & VALIDATION
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: STUDENT REGISTRATION & VALIDATION ---');
    const timestamp = Date.now();
    const testStudentEmail = `student_${timestamp}@aps.edu.in`;
    const testStudentRegNo = `APS-BCA-2026-${String(timestamp).slice(-3)}`;

    const malformedEmail = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Malformed Address', student_id: `BAD-${timestamp}`, email: 'not-an-email',
        department: 'BCA', semester: 'Semester 4', password: 'LongEnoughPassword@456', confirmPassword: 'LongEnoughPassword@456'
      }
    });
    assert(malformedEmail.status === 400, 'Malformed email syntax is rejected by the registration API');

    const weakPassword = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Weak Password', student_id: `WEAK-${timestamp}`, email: `weak_${timestamp}@aps.edu.in`,
        department: 'BCA', semester: 'Semester 4', password: 'Password123', confirmPassword: 'Password123'
      }
    });
    assert(weakPassword.status === 400, 'Common passwords are rejected by the backend');

    const shortPassword = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Short Password', student_id: `SHORT-${timestamp}`, email: `short_${timestamp}@aps.edu.in`,
        department: 'BCA', semester: 'Semester 4', password: 'short7', confirmPassword: 'short7'
      }
    });
    assert(shortPassword.status === 400, 'Passwords shorter than eight characters are rejected');

    globalThis.__NAMMA_TEST_EMAIL_FAILURES = new Set([testStudentEmail]);
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Pradeep Sharma',
        student_id: testStudentRegNo,
        email: testStudentEmail,
        phone: '9845012345',
        department: 'BCA',
        semester: 'Semester 4',
        password: 'StudentSecure@123',
        confirmPassword: 'StudentSecure@123',
        role: 'admin' // Attempted privilege escalation
      }
    });
    globalThis.__NAMMA_TEST_EMAIL_FAILURES.clear();

    assert(regRes.status === 201 && regRes.data.success === true, 'Student registration succeeds');
    assert(regRes.data.user.student_id === testStudentRegNo, `Assigned registration number matches: ${testStudentRegNo}`);
    assert(regRes.data.user.role === 'student', 'Role remains strictly student (privilege escalation blocked)');
    assert(!regRes.data.user.password_hash, 'Password hash is NOT exposed in registration response');
    assert(regRes.data.message === 'Registration successful. You can now log in.', 'Registration explains that the student can sign in immediately');
    assert(!Object.hasOwn(regRes.data, 'deliveryStatus'), 'Registration makes no claim about email delivery');
    assert(get('SELECT email_verified FROM students WHERE email = ?', [testStudentEmail]).email_verified === 1, 'New accounts are eligible to sign in without email OTP');
    assert(get("SELECT COUNT(*) AS count FROM auth_otps WHERE user_id = ? AND purpose = 'email_verification'", [regRes.data.user.id]).count === 0, 'Registration does not create an email verification OTP');
    assert(get("SELECT COUNT(*) AS count FROM auth_otp_requests WHERE purpose = 'email_verification'").count === 0, 'Registration does not reserve an email verification request');
    assert(!testEmailOutbox.some(message => message.to === testStudentEmail), 'Registration succeeds even when the test email transport would reject delivery');

    const missingEmail = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Missing Address', student_id: `MISSING-${timestamp}`,
        department: 'BCA', semester: 'Semester 4', password: 'LongEnoughPassword@456', confirmPassword: 'LongEnoughPassword@456'
      }
    });
    assert(missingEmail.status === 400, 'The registration API requires an email address');

    // Duplicate email rejected
    const dupEmailRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Another Student',
        student_id: `APS-BCA-2026-${String(timestamp + 1).slice(-3)}`,
        email: testStudentEmail.toUpperCase(),
        department: 'BCA',
        semester: 'Semester 4',
        password: 'UniquePhrase!406',
        confirmPassword: 'UniquePhrase!406'
      }
    });
    assert(dupEmailRes.status === 409, 'Duplicate student email rejected with HTTP 409 Conflict');

    // Duplicate registration number rejected
    const dupRegNoRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Another Student',
        student_id: testStudentRegNo.toLowerCase(),
        email: `another_${timestamp}@aps.edu.in`,
        department: 'BCA',
        semester: 'Semester 4',
        password: 'UniquePhrase!406',
        confirmPassword: 'UniquePhrase!406'
      }
    });
    assert(dupRegNoRes.status === 409, 'Duplicate College Registration Number rejected with HTTP 409 Conflict');

    const timeoutEmail = `provider_timeout_${timestamp}@aps.edu.in`;
    let registrationEmailCalls = 0;
    const providerUnavailableRegistration = await withResendResponse(
      () => {
        registrationEmailCalls++;
        return Promise.reject(Object.assign(new Error('simulated timeout'), { name: 'TimeoutError' }));
      },
      () => request('/api/auth/register', {
        method: 'POST', body: {
          name: 'Provider Timeout Account', student_id: `TIMEOUT-${timestamp}`, email: timeoutEmail,
          department: 'BCA', semester: 'Semester 1', password: 'TimeoutFailure#5182', confirmPassword: 'TimeoutFailure#5182'
        }
      })
    );
    assert(providerUnavailableRegistration.status === 201 && registrationEmailCalls === 0, 'Registration succeeds without calling an unavailable email provider');
    assert(get('SELECT email_verified FROM students WHERE email = ?', [timeoutEmail]).email_verified === 1, 'Provider availability does not control registration account activation');
    assert(get("SELECT COUNT(*) AS count FROM auth_otps WHERE user_id = (SELECT id FROM students WHERE email = ?) AND purpose = 'email_verification'", [timeoutEmail]).count === 0, 'Provider-unavailable registration creates no verification OTP');

    // The email verification implementation stays available for later reactivation.
    const manualOtpEmail = `manual_otp_${timestamp}@aps.edu.in`;
    const manualOtpRegistration = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Manual OTP Account', student_id: `OTP-${timestamp}`, email: manualOtpEmail,
        department: 'BCA', semester: 'Semester 1', password: 'ManualOtpPass#5182', confirmPassword: 'ManualOtpPass#5182'
      }
    });
    const manualOtpStudent = get('SELECT id FROM students WHERE email = ?', [manualOtpEmail]);
    run('UPDATE students SET email_verified = 0 WHERE id = ?', [manualOtpStudent.id]);
    const legacyStudentLogin = await request('/api/auth/student/login', {
      method: 'POST', body: { email: manualOtpEmail, password: 'ManualOtpPass#5182' }
    });
    const legacyStudentCookie = legacyStudentLogin.cookie ? legacyStudentLogin.cookie.split(';')[0] : '';
    const legacyStudentSession = await request('/api/auth/me', { headers: { Cookie: legacyStudentCookie } });
    assert(legacyStudentLogin.status === 200 && get('SELECT email_verified FROM students WHERE id = ?', [manualOtpStudent.id]).email_verified === 0, 'Existing unverified students can log in while OTP is off without changing their stored verification state');
    assert(legacyStudentSession.status === 200 && legacyStudentSession.data.authenticated === true, 'Existing unverified student sessions remain valid while OTP is off');
    const reenabledLegacyLogin = await withStudentEmailVerificationEnabled(() => request('/api/auth/student/login', {
      method: 'POST', body: { email: manualOtpEmail, password: 'ManualOtpPass#5182' }
    }));
    const reenabledLegacySession = await withStudentEmailVerificationEnabled(() => request('/api/auth/me', { headers: { Cookie: legacyStudentCookie } }));
    assert(reenabledLegacyLogin.status === 403 && reenabledLegacyLogin.data.code === 'EMAIL_NOT_VERIFIED' && reenabledLegacySession.data.authenticated === false, 'Re-enabling OTP restores the existing verification gate for legacy unverified accounts and sessions');
    const legacyReset = await request('/api/auth/forgot-password', {
      method: 'POST', body: { email: manualOtpEmail }
    });
    assert(legacyReset.status === 202 && get("SELECT COUNT(*) AS count FROM auth_otps WHERE user_id = ? AND purpose = 'password_reset'", [manualOtpStudent.id]).count === 0, 'Password reset still requires an eligible account and does not bypass its OTP checks');
    const manualOtpDelivery = await issueOtp({ email: manualOtpEmail, userType: 'student', userId: manualOtpStudent.id, purpose: 'email_verification' });
    const manualOtpCode = latestOtp(manualOtpEmail, 'Verify your NAMMA VOICE email');
    const pausedVerification = await request('/api/auth/verify-email', {
      method: 'POST', body: { email: manualOtpEmail, otp: manualOtpCode }
    });
    assert(pausedVerification.status === 410 && pausedVerification.data.code === 'EMAIL_VERIFICATION_DISABLED', 'Email OTP verification is disabled while the feature flag is off');
    const { badManualOtp, manualVerify, reusedManualOtp } = await withStudentEmailVerificationEnabled(async () => {
      const bad = await request('/api/auth/verify-email', {
        method: 'POST', body: { email: manualOtpEmail, otp: manualOtpCode === '000000' ? '000001' : '000000' }
      });
      const verified = await request('/api/auth/verify-email', {
        method: 'POST', body: { email: manualOtpEmail, otp: manualOtpCode }
      });
      const reused = await request('/api/auth/verify-email', {
        method: 'POST', body: { email: manualOtpEmail, otp: manualOtpCode }
      });
      return { badManualOtp: bad, manualVerify: verified, reusedManualOtp: reused };
    });
    assert(manualOtpRegistration.status === 201 && manualOtpDelivery.accepted && badManualOtp.status === 400, 'Email verification OTPs remain purpose-bound and reject incorrect codes after reactivation');
    assert(manualVerify.status === 200 && reusedManualOtp.status === 400, 'The retained email verification endpoint accepts a valid code once');

    const expiredEmail = `expired_${timestamp}@aps.edu.in`;
    const expiredRegistration = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Expired Code Account', student_id: `EXPIRED-${timestamp}`, email: expiredEmail,
        department: 'BCA', semester: 'Semester 2', password: 'ComplexPassphrase#246', confirmPassword: 'ComplexPassphrase#246'
      }
    });
    const expiredStudent = get('SELECT id FROM students WHERE email = ?', [expiredEmail]);
    run('UPDATE students SET email_verified = 0 WHERE id = ?', [expiredStudent.id]);
    await issueOtp({ email: expiredEmail, userType: 'student', userId: expiredStudent.id, purpose: 'email_verification' });
    const expiredOtp = latestOtp(expiredEmail, 'Verify your NAMMA VOICE email');
    const expiredOtpRecord = get('SELECT id FROM auth_otps WHERE user_id = ? AND purpose = ?', [expiredRegistration.data.user.id, 'email_verification']);
    run('UPDATE auth_otps SET expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000).toISOString(), expiredOtpRecord.id]);
    const expiredVerification = await withStudentEmailVerificationEnabled(() => request('/api/auth/verify-email', {
      method: 'POST', body: { email: expiredEmail, otp: expiredOtp }
    }));
    assert(expiredVerification.status === 410, 'Expired email verification OTP is still rejected');

    const resendEmail = `resend_otp_${timestamp}@aps.edu.in`;
    const resendRegistration = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Resend OTP Account', student_id: `RESEND-${timestamp}`, email: resendEmail,
        department: 'BCA', semester: 'Semester 1', password: 'ResendOtpPass#5182', confirmPassword: 'ResendOtpPass#5182'
      }
    });
    const resendStudent = get('SELECT id FROM students WHERE email = ?', [resendEmail]);
    run('UPDATE students SET email_verified = 0 WHERE id = ?', [resendStudent.id]);
    run("DELETE FROM auth_otp_requests WHERE purpose = 'email_verification'");
    const disabledResend = await request('/api/auth/resend-verification-code', {
      method: 'POST', body: { email: resendEmail }
    });
    assert(disabledResend.status === 410 && disabledResend.data.code === 'EMAIL_VERIFICATION_DISABLED', 'The resend endpoint is disabled while registration email verification is paused');
    assert(get("SELECT COUNT(*) AS count FROM auth_otps WHERE user_id = ? AND purpose = 'email_verification'", [resendStudent.id]).count === 0, 'Disabled resend does not create an OTP');

    let reenabledResend;
    let resentRegistrationOtp;
    let verifyResentRegistrationOtp;
    await withStudentEmailVerificationEnabled(async () => {
      reenabledResend = await request('/api/auth/resend-verification-code', {
        method: 'POST', body: { email: resendEmail }
      });
      resentRegistrationOtp = latestOtp(resendEmail, 'Verify your NAMMA VOICE email');
      verifyResentRegistrationOtp = await request('/api/auth/verify-email', {
        method: 'POST', body: { email: resendEmail, otp: resentRegistrationOtp }
      });
    });
    assert(reenabledResend.status === 202 && reenabledResend.data.deliveryStatus === 'not_confirmed', 'The existing resend OTP route remains available when the feature is re-enabled');
    assert(!Object.hasOwn(reenabledResend.data, 'otp') && !/\b\d{6}\b/.test(JSON.stringify(reenabledResend.data)), 'The retained resend endpoint never exposes an OTP');
    assert(resendRegistration.status === 201 && verifyResentRegistrationOtp.status === 200, 'The retained resend endpoint can issue a code for future reactivation');

    const lockedCodeEmail = `attempt_limit_${timestamp}@aps.edu.in`;
    const lockedCodeRegistration = await request('/api/auth/register', {
      method: 'POST', body: {
        name: 'Attempt Limit Account', student_id: `LOCK-${timestamp}`, email: lockedCodeEmail,
        department: 'BCA', semester: 'Semester 1', password: 'AttemptLimit#5182', confirmPassword: 'AttemptLimit#5182'
      }
    });
    const lockedStudent = get('SELECT id FROM students WHERE email = ?', [lockedCodeEmail]);
    run('UPDATE students SET email_verified = 0 WHERE id = ?', [lockedStudent.id]);
    await issueOtp({ email: lockedCodeEmail, userType: 'student', userId: lockedStudent.id, purpose: 'email_verification' });
    const lockedCode = latestOtp(lockedCodeEmail, 'Verify your NAMMA VOICE email');
    const incorrectLockedCode = lockedCode === '000000' ? '000001' : '000000';
    const { lastAttemptStatus, lockedOtp } = await withStudentEmailVerificationEnabled(async () => {
      let lastStatus = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        const attemptRes = await request('/api/auth/verify-email', {
          method: 'POST', body: { email: lockedCodeEmail, otp: incorrectLockedCode }
        });
        lastStatus = attemptRes.status;
      }
      const correctAfterLock = await request('/api/auth/verify-email', {
        method: 'POST', body: { email: lockedCodeEmail, otp: lockedCode }
      });
      return { lastAttemptStatus: lastStatus, lockedOtp: correctAfterLock };
    });
    assert(lockedCodeRegistration.status === 201 && lastAttemptStatus === 429, 'Retained email OTP attempt limit locks a code after five incorrect attempts');
    assert(lockedOtp.status === 400, 'Correct email OTP is rejected after its attempt limit is reached');

    // ----------------------------------------------------
    // TEST GROUP 4: STUDENT LOGIN & ACCESS CONTROL
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: STUDENT AUTHENTICATION & SESSIONS ---');
    const studentLoginRes = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'StudentSecure@123' }
    });
    assert(studentLoginRes.status === 200 && studentLoginRes.data.success === true, 'Student can sign in immediately after registration without email OTP');
    const studentCookie = studentLoginRes.cookie ? studentLoginRes.cookie.split(';')[0] : '';
    assert(Boolean(studentCookie), 'Session cookie established for student');

    const privateStudentPage = await request('/student-dashboard.html', { headers: { Cookie: studentCookie } });
    assert(privateStudentPage.status === 200 && privateStudentPage.headers.get('x-robots-tag')?.includes('noindex'), 'Authenticated student page is protected from indexing');

    // Invalid password rejected
    const invalidStudentLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'WrongPassword@999' }
    });
    assert(invalidStudentLogin.status === 401, 'Invalid student password rejected with HTTP 401');

    const testStudentRow = get('SELECT id FROM students WHERE email = ?', [testStudentEmail]);
    run('UPDATE students SET is_active = 0 WHERE id = ?', [testStudentRow.id]);
    const inactiveStudentLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'StudentSecure@123' }
    });
    run('UPDATE students SET is_active = 1 WHERE id = ?', [testStudentRow.id]);
    assert(inactiveStudentLogin.status === 403, 'Inactive student account remains blocked from login');

    // Student cannot access admin-only API
    const studentAccessAdmin = await request('/api/admin/dashboard', {
      headers: { Cookie: studentCookie }
    });
    assert(studentAccessAdmin.status === 403, 'Student session denied access to admin API with HTTP 403 Forbidden');

    // Unauthenticated access rejected
    const unauthAccess = await request('/api/admin/dashboard');
    assert(unauthAccess.status === 401, 'Unauthenticated request to protected API rejected with HTTP 401');

    // ----------------------------------------------------
    // TEST GROUP 5: SECURE ADMINISTRATOR SETUP & LOGIN
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 5: SECURE ADMINISTRATOR SETUP & ACCESS ---');
    const adminEmail = `admin_${timestamp}@aps.edu.in`;
    const adminPassword = 'AdminPassKey@2026';

    // Provision admin securely via administrative setup module
    await createAdminAccount({
      name: 'Dr. Ramesh Babu',
      email: adminEmail,
      password: adminPassword,
      department: 'Administration'
    });

    const adminLoginRes = await request('/api/auth/admin/login', {
      method: 'POST',
      body: { email: adminEmail, password: adminPassword }
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data.success === true, 'Administrator logs in with setup credentials');
    const adminCookie = adminLoginRes.cookie ? adminLoginRes.cookie.split(';')[0] : '';
    assert(Boolean(adminCookie), 'Session cookie established for administrator');

    // Admin can access admin dashboard
    const adminDash = await request('/api/admin/dashboard', {
      headers: { Cookie: adminCookie }
    });
    assert(adminDash.status === 200 && adminDash.data.success === true, 'Administrator accesses admin dashboard data');
    assert(adminDash.data.stats.total === 0 && adminDash.data.stats.pending === 0 && adminDash.data.stats.inProgress === 0 && adminDash.data.stats.resolved === 0, 'Fresh database starts with zero complaint counters');
    assert(adminDash.headers.get('cache-control')?.includes('no-store'), 'Admin API responses are marked private and non-cacheable');

    const privateAdminPage = await request('/admin-dashboard.html', { headers: { Cookie: adminCookie } });
    assert(privateAdminPage.status === 200 && privateAdminPage.headers.get('x-robots-tag')?.includes('noindex'), 'Authenticated admin page is protected from indexing');
    assert(!privateAdminPage.data.includes('Registered Student Accounts') && !privateAdminPage.data.includes('admin-student-search') && !privateAdminPage.data.includes('admin-students-tbody'), 'Admin dashboard HTML omits student account management');
    assert(!privateAdminPage.data.includes('Live SQLite Database Inspector') && !privateAdminPage.data.includes('db-inspector-table') && !privateAdminPage.data.includes('db-table-tabs'), 'Admin dashboard HTML omits the SQLite database inspector');
    const adminDashboardScript = fs.readFileSync('public/js/admin-dashboard.js', 'utf8');
    assert(!adminDashboardScript.includes('/api/admin/students') && !adminDashboardScript.includes('/api/admin/database'), 'Admin dashboard JavaScript does not request student lists or table counts');

    // ----------------------------------------------------
    // TEST GROUP 6: ADMIN PRIVACY BOUNDARIES
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 6: ADMIN PRIVACY BOUNDARIES ---');
    const adminStudentsRes = await request('/api/admin/students', {
      headers: { Cookie: adminCookie }
    });
    const adminDatabaseRes = await request('/api/admin/database', {
      headers: { Cookie: adminCookie }
    });
    assert(adminStudentsRes.status === 404 && adminDatabaseRes.status === 404, 'Student-list and database-count endpoints are removed');

    const anonymousStudentsRes = await request('/api/admin/students');
    const studentStudentsRes = await request('/api/admin/students', { headers: { Cookie: studentCookie } });
    const studentDatabaseRes = await request('/api/admin/database', { headers: { Cookie: studentCookie } });
    const anonymousAuditRes = await request('/api/admin/audit-logs');
    const studentAuditRes = await request('/api/admin/audit-logs', { headers: { Cookie: studentCookie } });
    assert(anonymousStudentsRes.status === 401, 'Unauthenticated student-list request is rejected');
    assert(studentStudentsRes.status === 403 && studentDatabaseRes.status === 403, 'Student session cannot access administrator-only paths');
    assert(anonymousAuditRes.status === 401 && studentAuditRes.status === 403, 'Audit history still requires an administrator session');

    // Audit history remains available with a privacy-minimized response.
    run(
      `INSERT INTO audit_logs (admin_id, admin_name, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminLoginRes.data.user.id, 'Synthetic Admin Fixture', 'SYNTHETIC_PRIVACY_CHECK', 'student', 'synthetic-target', 'Synthetic Student fixture@example.test REG-PRIVATE-TEST', new Date().toISOString()]
    );
    const auditLogsRes = await request('/api/admin/audit-logs', {
      headers: { Cookie: adminCookie }
    });
    const auditJson = JSON.stringify(auditLogsRes.data.logs || []);
    assert(auditLogsRes.status === 200 && auditLogsRes.data.logs.length > 0, 'Administrator audit history remains available');
    assert(!auditJson.includes('fixture@example.test') && !auditJson.includes('REG-PRIVATE-TEST') && !auditJson.includes('synthetic-target'), 'Audit response omits account identifiers and free-text details');

    // ----------------------------------------------------
    // TEST GROUP 7: COMPLAINT LIFECYCLE & WORKFLOW
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 7: COMPLAINT LIFECYCLE & WORKFLOW ---');
    const complaintForm = new FormData();
    complaintForm.append('title', 'Projector HDMI port loose in Seminar Hall');
    complaintForm.append('description', 'The overhead projector HDMI connector in the Main Seminar Hall disconnects randomly during technical presentations.');
    complaintForm.append('category', 'Classroom');
    complaintForm.append('location', 'Seminar Hall, 2nd Floor');
    complaintForm.append('attachment', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'issue.png');

    const newComplaintRes = await request('/api/complaints', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: complaintForm
    });
    assert(newComplaintRes.status === 201 && newComplaintRes.data.success === true, 'Authenticated student submits complaint');
    const createdC = newComplaintRes.data.complaint;
    assert(createdC.complaint_id.startsWith('NV-'), `Complaint assigned sequential ID: ${createdC.complaint_id}`);
    assert(createdC.status === 'Pending', 'Initial complaint status is Pending');
    assert(!complaintHasStudentIdentity(createdC), 'Student complaint submission response omits account identifiers');
    assert(createdC.has_attachment === true, 'Complaint attachment is accepted and represented by a non-identifying flag');
    const attachmentRecord = get('SELECT attachment_path FROM complaints WHERE complaint_id = ?', [createdC.complaint_id]);
    const savedAttachmentPath = path.resolve(config.paths.complaintUploads, path.basename(attachmentRecord.attachment_path));
    assert(fs.existsSync(savedAttachmentPath), 'Uploaded complaint image is saved in persistent server storage');

    // Student retrieves personal complaints
    const myComplaintsRes = await request('/api/complaints/my', {
      headers: { Cookie: studentCookie }
    });
    assert(myComplaintsRes.status === 200, 'Student can retrieve personal complaints list');
    const foundMy = myComplaintsRes.data.complaints.find(c => c.complaint_id === createdC.complaint_id);
    assert(Boolean(foundMy), 'Submitted complaint appears in student My Complaints list');
    assert(foundMy && !complaintHasStudentIdentity(foundMy), 'Student complaint history response omits account identifiers');
    assert(foundMy?.has_attachment === true, 'Student My Complaints API exposes attachment availability');

    const studentDetailPage = await request(`/student-complaint-details.html?id=${encodeURIComponent(createdC.complaint_id)}`, { headers: { Cookie: studentCookie } });
    assert(studentDetailPage.status === 200 && studentDetailPage.data.includes('detail-attachment-download'), 'Student complaint detail page includes authenticated image view and download actions');
    assert(fs.readFileSync('public/js/complaint-details.js', 'utf8').includes('detail-attachment-view'), 'Student detail script renders the private attachment endpoint');

    // Admin views all complaints
    const allComplaintsRes = await request('/api/admin/complaints', {
      headers: { Cookie: adminCookie }
    });
    assert(allComplaintsRes.status === 200, 'Administrator can list campus complaints');
    const foundAdmin = allComplaintsRes.data.complaints.find(c => c.complaint_id === createdC.complaint_id);
    assert(Boolean(foundAdmin), 'Administrator sees the submitted complaint');
    assert(foundAdmin && !complaintHasStudentIdentity(foundAdmin), 'Admin complaint list contains no student identity fields');
    assert(foundAdmin?.has_attachment === true && !Object.hasOwn(foundAdmin, 'attachment_path'), 'Admin complaint list exposes attachment availability without exposing the storage path');
    const adminComplaintListPage = await request('/complaint-management.html', { headers: { Cookie: adminCookie } });
    assert(adminComplaintListPage.status === 200 && adminComplaintListPage.data.includes('<th>Attachment</th>'), 'Admin complaint list has an attachment column');
    assert(fs.readFileSync('public/js/complaint-management.js', 'utf8').includes('Download</a>'), 'Admin complaint list renders protected image actions');
    assert(!JSON.stringify(foundAdmin).includes(testStudentEmail) && !JSON.stringify(foundAdmin).includes(testStudentRegNo) && !JSON.stringify(foundAdmin).includes('Pradeep Sharma'), 'Admin complaint list contains no student name, email, or registration number');

    const adminDetailRes = await request(`/api/admin/complaints/${createdC.complaint_id}`, { headers: { Cookie: adminCookie } });
    assert(adminDetailRes.status === 200 && !complaintHasStudentIdentity(adminDetailRes.data.complaint), 'Admin complaint detail contains no student identity fields');
    assert(adminDetailRes.data.complaint.has_attachment === true, 'Admin complaint detail exposes attachment availability without file path or student ID');
    assert(!JSON.stringify(adminDetailRes.data.complaint).includes(testStudentEmail) && !JSON.stringify(adminDetailRes.data.complaint).includes(testStudentRegNo) && !JSON.stringify(adminDetailRes.data.complaint).includes('Pradeep Sharma'), 'Admin complaint detail contains no student name, email, or registration number');

    const adminAttachment = await request(`/api/admin/complaints/${createdC.complaint_id}/attachment`, { headers: { Cookie: adminCookie } });
    assert(adminAttachment.status === 200 && adminAttachment.headers.get('content-type')?.startsWith('image/'), 'Admin can retrieve a complaint attachment through the protected endpoint');
    assert(adminAttachment.headers.get('cache-control')?.includes('no-store'), 'Complaint attachment response is private and non-cacheable');
    const downloadedAdminAttachment = await request(`/api/admin/complaints/${createdC.complaint_id}/attachment?download=1`, { headers: { Cookie: adminCookie } });
    assert(downloadedAdminAttachment.status === 200 && downloadedAdminAttachment.headers.get('content-disposition')?.includes('attachment'), 'Administrator can download the private complaint image');
    const studentAttachment = await request(`/api/complaints/${createdC.complaint_id}/attachment`, { headers: { Cookie: studentCookie } });
    assert(studentAttachment.status === 200, 'The submitting student can retrieve their own attachment');
    const otherStudentEmail = `other_${timestamp}@aps.edu.in`;
    const otherStudentPassword = 'OtherStudentSecure@456';
    const otherRegistration = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Other Test Student',
        student_id: `OTHER-${timestamp}`,
        email: otherStudentEmail,
        department: 'BCA',
        semester: 'Semester 2',
        password: otherStudentPassword,
        confirmPassword: otherStudentPassword
      }
    });
    assert(otherRegistration.status === 201, 'Second isolated student account is registered for ownership tests');
    const otherLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: otherStudentEmail, password: otherStudentPassword }
    });
    const otherStudentCookie = otherLogin.cookie ? otherLogin.cookie.split(';')[0] : '';
    assert(otherLogin.status === 200 && Boolean(otherStudentCookie), 'Second student receives a separate authenticated session');
    const otherStudentDetail = await request(`/api/complaints/${createdC.complaint_id}`, { headers: { Cookie: otherStudentCookie } });
    const otherStudentAttachment = await request(`/api/complaints/${createdC.complaint_id}/attachment`, { headers: { Cookie: otherStudentCookie } });
    assert(otherStudentDetail.status === 403 && otherStudentAttachment.status === 403, 'Other students cannot read complaint details or download private attachments');
    const anonymousAttachment = await request(`/api/complaints/${createdC.complaint_id}/attachment`);
    assert(anonymousAttachment.status === 401, 'Unauthenticated users cannot retrieve complaint attachments');
    const restartedAttachment = await verifyAttachmentAfterProcessRestart(createdC.complaint_id, adminEmail, adminPassword);
    assert(restartedAttachment.status === 200 && restartedAttachment.contentType.startsWith('image/') && restartedAttachment.bytes > 0, `Uploaded image remains available after server restart (HTTP ${restartedAttachment.status}, ${restartedAttachment.contentType || 'no content type'}, ${restartedAttachment.bytes} bytes)`);

    const populatedAdminDashboard = await request('/api/admin/dashboard', { headers: { Cookie: adminCookie } });
    assert((populatedAdminDashboard.data.recentComplaints || []).every(c => !complaintHasStudentIdentity(c)), 'Admin dashboard recent complaint data contains no student identity fields');
    assert(populatedAdminDashboard.data.recentComplaints.find(c => c.complaint_id === createdC.complaint_id)?.has_attachment === true, 'Admin dashboard recent complaint data includes the attachment indicator');
    const dashboardJson = JSON.stringify(populatedAdminDashboard.data);
    assert(!dashboardJson.includes(testStudentEmail) && !dashboardJson.includes(testStudentRegNo) && !dashboardJson.includes('Pradeep Sharma'), 'Admin dashboard response contains no student account identifiers');

    const publicAttachment = await request('/uploads/complaints/unknown.jpg');
    assert(publicAttachment.status === 404, 'Complaint attachments are not publicly served as static files');

    fs.unlinkSync(savedAttachmentPath);
    const missingAdminAttachment = await request(`/api/admin/complaints/${createdC.complaint_id}/attachment`, { headers: { Cookie: adminCookie } });
    assert(missingAdminAttachment.status === 404, 'A missing image returns a safe 404 instead of an unhandled server error');
    const adminDetailPage = await request('/admin-complaint-details.html', { headers: { Cookie: adminCookie } });
    assert(adminDetailPage.status === 200 && adminDetailPage.data.includes('attachment-missing') && adminDetailPage.data.includes('Download image'), 'Admin details UI provides missing-image feedback and image actions');

    // Admin updates complaint status, department assignment, and remarks
    const updateRes = await request(`/api/admin/complaints/${createdC.complaint_id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: {
        assigned_department: 'IT Department',
        status: 'In Progress',
        admin_remarks: 'Technician dispatched with replacement high-speed HDMI cable and wall adapter.'
      }
    });
    assert(updateRes.status === 200 && updateRes.data.complaint.status === 'In Progress', 'Admin updates complaint to In Progress');
    assert(!complaintHasStudentIdentity(updateRes.data.complaint), 'Admin complaint update response omits student identity');

    // Student verifies updated status and department
    const studentViewUpdated = await request(`/api/complaints/${createdC.complaint_id}`, {
      headers: { Cookie: studentCookie }
    });
    assert(studentViewUpdated.status === 200, 'Student retrieves updated complaint');
    assert(studentViewUpdated.data.complaint.status === 'In Progress', 'Student sees updated In Progress status');
    assert(studentViewUpdated.data.complaint.assigned_department === 'IT Department', 'Student sees assigned IT Department');
    assert(studentViewUpdated.data.complaint.history.length >= 2, 'Complaint has chronological history audit trail entries');

    // Admin marks complaint Resolved
    const resolveRes = await request(`/api/admin/complaints/${createdC.complaint_id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: {
        status: 'Resolved',
        admin_remarks: 'Wall plate HDMI port replaced and tested with seminar podium laptop.'
      }
    });
    assert(resolveRes.status === 200 && resolveRes.data.complaint.status === 'Resolved', 'Admin successfully marks complaint Resolved');

    // ----------------------------------------------------
    // TEST GROUP 8: ACADEMIC RESOURCES & DOWNLOADS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 8: ACADEMIC RESOURCES REPOSITORY ---');
    const resourcesRes = await request('/api/resources');
    assert(resourcesRes.status === 200 && Array.isArray(resourcesRes.data.resources), 'Academic resources API returns array of question papers');
    assert(resourcesRes.data.resources.length >= 4, 'Academic question papers are present in digital repository');

    const sampleResource = resourcesRes.data.resources[0];
    const downloadRes = await request(`/api/resources/${sampleResource.id}/download`);
    assert(downloadRes.status === 200, 'Download endpoint serves question paper file');
    assert(downloadRes.headers.get('content-type') === 'application/pdf', 'Downloaded resource has application/pdf Content-Type');

    const resourceForm = new FormData();
    resourceForm.append('title', 'Automated upload workflow verification');
    resourceForm.append('subject', 'Computer Science');
    resourceForm.append('department', 'BCA');
    resourceForm.append('semester', 'Semester 4');
    resourceForm.append('academic_year', '2025-2026');
    resourceForm.append('file', new Blob(['%PDF-1.4\n% test upload'], { type: 'application/pdf' }), 'workflow-check.pdf');
    const resourceUpload = await request('/api/resources', {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: resourceForm
    });
    assert(resourceUpload.status === 201 && resourceUpload.data.success, 'Administrator can upload an academic resource');
    const uploadedResource = await request(`/api/resources/${encodeURIComponent(resourceUpload.data.resource.resource_id)}/download`);
    assert(uploadedResource.status === 200 && uploadedResource.headers.get('content-type') === 'application/pdf', 'Uploaded academic resource remains downloadable');

    // ----------------------------------------------------
    // TEST GROUP 9: FORGOT & RESET PASSWORD FLOW
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 9: FORGOT & RESET PASSWORD FLOW ---');

    setTestEmailTransport(null);
    const missingMailResend = await request('/api/auth/resend-verification-code', {
      method: 'POST', body: { email: testStudentEmail }
    });
    const missingMailResendUnknown = await request('/api/auth/resend-verification-code', {
      method: 'POST', body: { email: 'unknown_mail_config@example.invalid' }
    });
    const missingMailReset = await request('/api/auth/forgot-password', {
      method: 'POST', body: { email: testStudentEmail }
    });
    assert(missingMailResend.status === 410 && missingMailResend.data.code === 'EMAIL_VERIFICATION_DISABLED', 'Registration resend remains disabled even when mail configuration is missing');
    assert(missingMailReset.status === 503 && missingMailReset.data.code === 'EMAIL_DELIVERY_UNAVAILABLE', 'Password-reset request reports missing mail configuration accurately');
    assert(JSON.stringify(missingMailResend.data) === JSON.stringify(missingMailResendUnknown.data), 'Missing mail configuration response does not reveal account existence');
    setTestEmailTransport(captureTestEmail);

    // Request password reset for existing email
    const forgotRes = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: testStudentEmail }
    });
    assert(forgotRes.status === 202 && forgotRes.data.success === true, 'Forgot password request returns a generic accepted response');
    const initialResetOtp = latestOtp(testStudentEmail, 'password reset code');

    // Non-existent email returns identical generic message
    const forgotNonExistent = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nonexistent_user_9999@aps.edu.in' }
    });
    assert(forgotNonExistent.status === 202 && forgotNonExistent.data.message === forgotRes.data.message, 'Unknown email receives the same generic password-reset response');

    run("DELETE FROM auth_otp_requests WHERE purpose = 'password_reset'");
    const resetResend = await request('/api/auth/forgot-password', {
      method: 'POST', body: { email: testStudentEmail }
    });
    const resetOtp = latestOtp(testStudentEmail, 'password reset code');
    assert(resetResend.status === 202 && resetResend.data.deliveryStatus === 'not_confirmed', 'Password-reset resend uses the same generic request contract and endpoint');
    const invalidatedInitialResetOtp = await request('/api/auth/verify-password-reset', {
      method: 'POST', body: { email: testStudentEmail, otp: initialResetOtp }
    });
    assert(invalidatedInitialResetOtp.status === 400, 'Password-reset resend invalidates the previously issued code');

    const originalWarn = console.warn;
    let providerDiagnosticLog = '';
    console.warn = message => { providerDiagnosticLog += String(message); };
    let providerRejectedReset;
    try {
      providerRejectedReset = await withResendResponse(
        async () => new Response(JSON.stringify({ name: 'authentication_error', message: 'Invalid API key: re_FAKEKEY1234567890 for hidden@example.test; OTP 123456.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
        () => request('/api/auth/forgot-password', { method: 'POST', body: { email: adminEmail } })
      );
    } finally {
      console.warn = originalWarn;
    }
    assert(providerRejectedReset.status === 202 && providerRejectedReset.data.deliveryStatus === 'not_confirmed', 'Provider rejection is not reported as a delivered reset code');
    assert(providerDiagnosticLog.includes('http_status=401') && providerDiagnosticLog.includes('provider_name=authentication_error') && providerDiagnosticLog.includes('Invalid API key'), 'Authentication controller path logs provider HTTP status, error name, and sanitized message');
    assert(!providerDiagnosticLog.includes('re_FAKEKEY') && !providerDiagnosticLog.includes('hidden@example.test') && !providerDiagnosticLog.includes('123456'), 'OTP failure diagnostic logs do not expose key-like values, email addresses, or codes');
    const rejectedAdminOtp = get("SELECT used FROM auth_otps WHERE user_type = 'admin' AND user_id = (SELECT id FROM admins WHERE email = ?) AND purpose = 'password_reset' ORDER BY id DESC LIMIT 1", [adminEmail]);
    assert(rejectedAdminOtp?.used === 1, 'OTP is invalidated when the provider rejects an email request');

    const resetWithoutVerification = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        newPassword: 'BrandNewPassword@2026',
        confirmPassword: 'BrandNewPassword@2026'
      }
    });
    assert(resetWithoutVerification.status === 401, 'Password cannot be reset without a verified OTP session');

    const wrongResetOtp = resetOtp === '999999' ? '999998' : '999999';
    const invalidOtpRes = await request('/api/auth/verify-password-reset', {
      method: 'POST', body: { email: testStudentEmail, otp: wrongResetOtp }
    });
    assert(invalidOtpRes.status === 400, 'Incorrect password-reset OTP is rejected');

    const validOtpRes = await request('/api/auth/verify-password-reset', {
      method: 'POST', body: { email: testStudentEmail, otp: resetOtp }
    });
    assert(validOtpRes.status === 200 && validOtpRes.data.success === true, 'Correct reset OTP creates a one-time reset session');
    const resetCookie = validOtpRes.cookie ? validOtpRes.cookie.split(';')[0] : '';
    assert(Boolean(resetCookie), 'Reset authorization is stored in a server-managed session');

    const validResetRes = await request('/api/auth/reset-password', {
      method: 'POST',
      headers: { Cookie: resetCookie },
      body: {
        newPassword: 'BrandNewPassword@2026',
        confirmPassword: 'BrandNewPassword@2026'
      }
    });
    assert(validResetRes.status === 200 && validResetRes.data.success === true, 'Password successfully reset after email OTP verification');

    const reuseOtpRes = await request('/api/auth/verify-password-reset', {
      method: 'POST', body: { email: testStudentEmail, otp: resetOtp }
    });
    assert(reuseOtpRes.status === 400, 'A password-reset OTP cannot be reused');
    const repeatedReset = await request('/api/auth/reset-password', {
      method: 'POST', headers: { Cookie: resetCookie },
      body: { newPassword: 'AnotherComplexPhrase@2026', confirmPassword: 'AnotherComplexPhrase@2026' }
    });
    assert(repeatedReset.status === 401, 'The reset authorization cannot be reused after the password changes');

    // Old password no longer works
    const oldPassLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'StudentSecure@123' }
    });
    assert(oldPassLogin.status === 401, 'Old password rejected after password reset');

    // New password succeeds
    const newPassLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'BrandNewPassword@2026' }
    });
    assert(newPassLogin.status === 200 && newPassLogin.data.success === true, 'New password successfully authenticates login');
    const staleSession = await request('/api/auth/me', { headers: { Cookie: studentCookie } });
    assert(staleSession.status === 200 && staleSession.data.authenticated === false, 'Password reset invalidates the student’s existing session');

    let ipLimitedOtpRequest = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      ipLimitedOtpRequest = await request('/api/auth/resend-verification-code', {
        method: 'POST', body: { email: `unknown_rate_${timestamp}_${attempt}@aps.edu.in` }
      });
    }
    assert(ipLimitedOtpRequest.status === 429, 'OTP request rate limit is enforced by client IP');

    // ----------------------------------------------------
    // TEST GROUP 10: SQLITE PERSISTENCE & BACKUP SCRIPT
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 10: SQLITE PERSISTENCE & BACKUP ---');
    const dbStudent = get('SELECT id, name, email FROM students WHERE email = ?', [testStudentEmail]);
    assert(Boolean(dbStudent && dbStudent.name), 'Student persistently stored in SQLite database');

    const dbComplaintsCount = get('SELECT COUNT(*) as count FROM complaints').count;
    assert(dbComplaintsCount >= 1, `Complaints persistently stored in SQLite table (count: ${dbComplaintsCount})`);

    // Test database backup utility
    const backupFile = createDatabaseBackup();
    assert(Boolean(backupFile && fs.existsSync(backupFile)), 'Database backup utility created snapshot file');

    console.log('\n====================================================');
    console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('====================================================');

    if (failedTests > 0) {
      throw new Error(`${failedTests} acceptance checks failed.`);
    }
  } finally {
    if (server) server.close();
  }
}

export const testRun = runTests();
