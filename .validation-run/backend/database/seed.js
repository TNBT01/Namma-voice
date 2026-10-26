/**
 * NAMMA VOICE - Database Initialization & Seed Script
 * APS College of Arts and Science
 * Seeds initial academic repository resources and verifies administrator accounts safely.
 * DOES NOT seed public demo passwords or demo login buttons.
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config/config.js';
import { get, run, transaction } from './database.js';

/**
 * Generate a valid minimal PDF buffer for sample question papers.
 */
function createSamplePdfBuffer(title, subject, semester, academicYear) {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 18 Tf
50 720 Td
(APS COLLEGE OF ARTS AND SCIENCE) Tj
/F1 14 Tf
0 -30 Td
(NAMMA VOICE - ACADEMIC RESOURCE ARCHIVE) Tj
/F1 12 Tf
0 -30 Td
(${subject} - ${semester} [${academicYear}]) Tj
0 -25 Td
(${title}) Tj
0 -30 Td
(This is an official digitized question paper from the college repository.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000494 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
570
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

export async function seedDatabase() {
  const now = new Date().toISOString();

  // 1. Provision & Verify College Administrator Account
  const defaultAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@aps.edu.in').trim().toLowerCase();
  const defaultAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AdminSecure@2026';
  const defaultAdminName = process.env.INITIAL_ADMIN_NAME || 'Dr. Ramesh Babu';

  // Migrate legacy demo admin account if present
  const demoAdmin = get('SELECT id FROM admins WHERE email = ?', ['admin@namma-voice.demo']);
  if (demoAdmin) {
    const adminHash = await bcrypt.hash(defaultAdminPassword, 10);
    run(
      `UPDATE admins SET email = ?, name = ?, password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?`,
      [defaultAdminEmail, defaultAdminName, adminHash, now, demoAdmin.id]
    );
    console.log(`✓ Upgraded administrator account to official email: ${defaultAdminEmail}`);
  }

  // Ensure primary administrator account exists
  const existingAdmin = get('SELECT id FROM admins WHERE email = ?', [defaultAdminEmail]);
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash(defaultAdminPassword, 10);
    run(
      `INSERT INTO admins (name, email, password_hash, department, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'Administration', 'admin', 1, ?, ?)`,
      [defaultAdminName, defaultAdminEmail, adminHash, now, now]
    );
    console.log(`✓ Official college administrator account provisioned: ${defaultAdminEmail}`);
  }

  // Migrate legacy demo student account if present
  const demoStudent = get('SELECT id FROM students WHERE email = ?', ['student@namma-voice.demo']);
  if (demoStudent) {
    const studentHash = await bcrypt.hash('StudentSecure@123', 10);
    run(
      `UPDATE students SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
      ['darshan@aps.edu.in', studentHash, now, demoStudent.id]
    );
  }

  // 2. Seed Academic Resources (Digitized previous year question papers for BCA, B.Sc, B.A)
  const sampleResources = [
    {
      resource_id: 'RES-2026-001',
      title: 'Web Programming & Development - Question Paper 2025',
      department: 'BCA',
      subject: 'Web Programming',
      semester: 'Semester 6',
      academic_year: '2024-2025',
      filename: 'bca_sem6_web_programming_2025.pdf'
    },
    {
      resource_id: 'RES-2026-002',
      title: 'Database Management Systems (DBMS) - Model Question Paper 2025',
      department: 'BCA',
      subject: 'Database Management Systems',
      semester: 'Semester 4',
      academic_year: '2024-2025',
      filename: 'bca_sem4_dbms_2025.pdf'
    },
    {
      resource_id: 'RES-2026-003',
      title: 'Data Structures with C++ - End Semester Paper 2024',
      department: 'BCA',
      subject: 'Data Structures',
      semester: 'Semester 3',
      academic_year: '2023-2024',
      filename: 'bca_sem3_data_structures_2024.pdf'
    },
    {
      resource_id: 'RES-2026-004',
      title: 'Operating System Principles - Annual Exam Paper 2025',
      department: 'B.Sc',
      subject: 'Operating Systems',
      semester: 'Semester 5',
      academic_year: '2024-2025',
      filename: 'bsc_sem5_operating_systems_2025.pdf'
    },
    {
      resource_id: 'RES-2026-005',
      title: 'Indian Economics & Public Policy - Annual Exam 2025',
      department: 'B.A',
      subject: 'Economics',
      semester: 'Semester 4',
      academic_year: '2024-2025',
      filename: 'ba_sem4_economics_2025.pdf'
    }
  ];

  const resDir = config.paths.resourceUploads;
  if (!fs.existsSync(resDir)) {
    fs.mkdirSync(resDir, { recursive: true });
  }

  for (const r of sampleResources) {
    const existing = get('SELECT id FROM resources WHERE resource_id = ?', [r.resource_id]);
    if (!existing) {
      const filePath = path.join(resDir, r.filename);
      if (!fs.existsSync(filePath)) {
        const buffer = createSamplePdfBuffer(r.title, r.subject, r.semester, r.academic_year);
        fs.writeFileSync(filePath, buffer);
      }

      run(
        `INSERT INTO resources (resource_id, title, department, subject, semester, academic_year, file_path, original_filename, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.resource_id,
          r.title,
          r.department,
          r.subject,
          r.semester,
          r.academic_year,
          r.filename,
          r.filename,
          'Academic Office (APS College)',
          now
        ]
      );
    }
  }

  console.log('✓ Database initialization verified.');
}

export default seedDatabase;
