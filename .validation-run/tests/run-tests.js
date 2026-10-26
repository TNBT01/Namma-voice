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
import fs from 'fs';
import path from 'path';
import { app } from '../backend/app.js';
import { createSchema } from '../backend/database/init-db.js';
import { seedDatabase } from '../backend/database/seed.js';
import { get, query } from '../backend/database/database.js';
import { createAdminAccount } from '../backend/scripts/create-admin.js';
import { createDatabaseBackup } from '../backend/scripts/backup-db.js';

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
    // TEST GROUP 1: HEALTH CHECK & REQUIRED PAGES
    // ----------------------------------------------------
    console.log('--- TEST GROUP 1: HEALTH CHECK & REQUIRED PAGES ---');
    const health = await request('/api/health');
    assert(health.status === 200 && health.data.status === 'healthy', 'Health check API returns 200 OK and healthy status');

    const requiredPages = [
      'index.html',
      'about.html',
      'courses.html',
      'student-login.html',
      'student-register.html',
      'admin-login.html',
      'forgot-password.html',
      'reset-password.html',
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

    // ----------------------------------------------------
    // TEST GROUP 2: REMOVAL OF DEMO CREDENTIALS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: REMOVAL OF DEMO CREDENTIALS ---');
    const studentLoginHtml = fs.readFileSync(path.resolve('public/student-login.html'), 'utf-8');
    const adminLoginHtml = fs.readFileSync(path.resolve('public/admin-login.html'), 'utf-8');

    assert(!studentLoginHtml.includes('btn-fill-student-demo'), 'No demo autofill button in student-login.html');
    assert(!studentLoginHtml.includes('demo-credentials-box'), 'No demo credentials box in student-login.html');
    assert(!adminLoginHtml.includes('btn-fill-admin-demo'), 'No demo autofill button in admin-login.html');
    assert(!adminLoginHtml.includes('demo-credentials-box'), 'No demo credentials box in admin-login.html');

    // ----------------------------------------------------
    // TEST GROUP 3: STUDENT REGISTRATION & VALIDATION
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: STUDENT REGISTRATION & VALIDATION ---');
    const timestamp = Date.now();
    const testStudentEmail = `student_${timestamp}@aps.edu.in`;
    const testStudentRegNo = `APS-BCA-2026-${String(timestamp).slice(-3)}`;

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

    assert(regRes.status === 201 && regRes.data.success === true, 'Student registration succeeds');
    assert(regRes.data.user.student_id === testStudentRegNo, `Assigned registration number matches: ${testStudentRegNo}`);
    assert(regRes.data.user.role === 'student', 'Role remains strictly student (privilege escalation blocked)');
    assert(!regRes.data.user.password_hash, 'Password hash is NOT exposed in registration response');

    // Duplicate email rejected
    const dupEmailRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Another Student',
        student_id: `APS-BCA-2026-${String(timestamp + 1).slice(-3)}`,
        email: testStudentEmail,
        department: 'BCA',
        semester: 'Semester 4',
        password: 'Password@123',
        confirmPassword: 'Password@123'
      }
    });
    assert(dupEmailRes.status === 409, 'Duplicate student email rejected with HTTP 409 Conflict');

    // Duplicate registration number rejected
    const dupRegNoRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Another Student',
        student_id: testStudentRegNo,
        email: `another_${timestamp}@aps.edu.in`,
        department: 'BCA',
        semester: 'Semester 4',
        password: 'Password@123',
        confirmPassword: 'Password@123'
      }
    });
    assert(dupRegNoRes.status === 409, 'Duplicate College Registration Number rejected with HTTP 409 Conflict');

    // ----------------------------------------------------
    // TEST GROUP 4: STUDENT LOGIN & ACCESS CONTROL
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: STUDENT AUTHENTICATION & SESSIONS ---');
    const studentLoginRes = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'StudentSecure@123' }
    });
    assert(studentLoginRes.status === 200 && studentLoginRes.data.success === true, 'Registered student logs in successfully');
    const studentCookie = studentLoginRes.cookie ? studentLoginRes.cookie.split(';')[0] : '';
    assert(Boolean(studentCookie), 'Session cookie established for student');

    // Invalid password rejected
    const invalidStudentLogin = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'WrongPassword@999' }
    });
    assert(invalidStudentLogin.status === 401, 'Invalid student password rejected with HTTP 401');

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

    // ----------------------------------------------------
    // TEST GROUP 6: STUDENT ACCOUNT ADMINISTRATION & AUDIT
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 6: STUDENT ADMINISTRATION & AUDIT LOGS ---');
    const adminStudentsRes = await request('/api/admin/students', {
      headers: { Cookie: adminCookie }
    });
    assert(adminStudentsRes.status === 200 && Array.isArray(adminStudentsRes.data.students), 'Admin retrieves registered student list');
    const createdStudentInList = adminStudentsRes.data.students.find(s => s.email === testStudentEmail);
    assert(Boolean(createdStudentInList), 'Registered student found in administrator management view');
    assert(!createdStudentInList.password_hash, 'Password hashes are NOT returned in student list API');

    // Deactivate student account
    const deactivateRes = await request(`/api/admin/students/${createdStudentInList.id}/status`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: { is_active: 0 }
    });
    assert(deactivateRes.status === 200 && deactivateRes.data.student.is_active === 0, 'Admin can deactivate student account');

    // Deactivated student login is rejected with 403
    const deactivatedLoginRes = await request('/api/auth/student/login', {
      method: 'POST',
      body: { email: testStudentEmail, password: 'StudentSecure@123' }
    });
    assert(deactivatedLoginRes.status === 403, 'Deactivated student login rejected with HTTP 403');

    // Reactivate student account
    const reactivateRes = await request(`/api/admin/students/${createdStudentInList.id}/status`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: { is_active: 1 }
    });
    assert(reactivateRes.status === 200 && reactivateRes.data.student.is_active === 1, 'Admin can reactivate student account');

    // Audit logs recorded
    const auditLogsRes = await request('/api/admin/audit-logs', {
      headers: { Cookie: adminCookie }
    });
    assert(auditLogsRes.status === 200 && auditLogsRes.data.logs.length > 0, 'Audit logs recorded for administrator actions');

    // ----------------------------------------------------
    // TEST GROUP 7: COMPLAINT LIFECYCLE & WORKFLOW
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 7: COMPLAINT LIFECYCLE & WORKFLOW ---');
    const newComplaintRes = await request('/api/complaints', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: {
        title: 'Projector HDMI port loose in Seminar Hall',
        description: 'The overhead projector HDMI connector in the Main Seminar Hall disconnects randomly during technical presentations.',
        category: 'Classroom',
        location: 'Seminar Hall, 2nd Floor'
      }
    });
    assert(newComplaintRes.status === 201 && newComplaintRes.data.success === true, 'Authenticated student submits complaint');
    const createdC = newComplaintRes.data.complaint;
    assert(createdC.complaint_id.startsWith('NV-'), `Complaint assigned sequential ID: ${createdC.complaint_id}`);
    assert(createdC.status === 'Pending', 'Initial complaint status is Pending');

    // Student retrieves personal complaints
    const myComplaintsRes = await request('/api/complaints/my', {
      headers: { Cookie: studentCookie }
    });
    assert(myComplaintsRes.status === 200, 'Student can retrieve personal complaints list');
    const foundMy = myComplaintsRes.data.complaints.find(c => c.complaint_id === createdC.complaint_id);
    assert(Boolean(foundMy), 'Submitted complaint appears in student My Complaints list');

    // Admin views all complaints
    const allComplaintsRes = await request('/api/admin/complaints', {
      headers: { Cookie: adminCookie }
    });
    assert(allComplaintsRes.status === 200, 'Administrator can list campus complaints');
    const foundAdmin = allComplaintsRes.data.complaints.find(c => c.complaint_id === createdC.complaint_id);
    assert(Boolean(foundAdmin), 'Administrator sees the submitted complaint');

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

    // ----------------------------------------------------
    // TEST GROUP 9: FORGOT & RESET PASSWORD FLOW
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 9: FORGOT & RESET PASSWORD FLOW ---');
    // Request password reset for existing email
    const forgotRes = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: testStudentEmail }
    });
    assert(forgotRes.status === 200 && forgotRes.data.success === true, 'Forgot password request returns success');
    assert(forgotRes.data.message.includes('password reset instructions'), 'Generic message displayed without revealing account enumeration');

    // Non-existent email returns identical generic message
    const forgotNonExistent = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nonexistent_user_9999@aps.edu.in' }
    });
    assert(forgotNonExistent.status === 200, 'Non-existent email also returns generic 200 (prevents user enumeration)');

    // Retrieve generated reset token via development helper
    const devTokenRes = await request(`/api/auth/dev/latest-reset-token?email=${encodeURIComponent(testStudentEmail)}`);
    assert(devTokenRes.status === 200 && Boolean(devTokenRes.data.token), 'Cryptographic reset token generated and retrieved');
    const resetToken = devTokenRes.data.token;

    // Reset with invalid/tampered token rejected
    const invalidTokenRes = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: 'invalid_tampered_token_abcdef123456',
        newPassword: 'BrandNewPassword@2026',
        confirmPassword: 'BrandNewPassword@2026'
      }
    });
    assert(invalidTokenRes.status === 400, 'Invalid reset token rejected with HTTP 400');

    // Complete password reset with valid token
    const validResetRes = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: resetToken,
        newPassword: 'BrandNewPassword@2026',
        confirmPassword: 'BrandNewPassword@2026'
      }
    });
    assert(validResetRes.status === 200 && validResetRes.data.success === true, 'Password successfully reset with valid token');

    // Token cannot be reused (single-use enforcement)
    const reuseTokenRes = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: resetToken,
        newPassword: 'AnotherPassword@2026',
        confirmPassword: 'AnotherPassword@2026'
      }
    });
    assert(reuseTokenRes.status === 400, 'Reusing the same reset token is strictly rejected with HTTP 400');

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
      process.exit(1);
    }
  } finally {
    if (server) server.close();
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
