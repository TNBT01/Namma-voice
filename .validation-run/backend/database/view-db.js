/**
 * NAMMA VOICE - SQLite Database Terminal Inspector
 * Displays all tables and records in clean console tables.
 * Usage: node backend/database/view-db.js  or  npm run db:view
 */

import { initDatabase, query } from './database.js';

async function viewDatabase() {
  await initDatabase();

  console.log('\n=====================================================================');
  console.log('       NAMMA VOICE — SQLITE DATABASE RECORDS INSPECTOR');
  console.log('       File: database/namma_voice.sqlite');
  console.log('=====================================================================\n');

  // 1. Students Table
  console.log('▶ TABLE: students');
  const students = query('SELECT id, student_id, name, email, phone, department, semester, created_at FROM students');
  if (students.length === 0) {
    console.log('  (No students recorded)\n');
  } else {
    console.table(students);
  }

  // 2. Administrators Table
  console.log('▶ TABLE: admins');
  const admins = query('SELECT id, name, email, department, role, created_at FROM admins');
  if (admins.length === 0) {
    console.log('  (No administrators recorded)\n');
  } else {
    console.table(admins);
  }

  // 3. Complaints Table
  console.log('▶ TABLE: complaints');
  const complaints = query('SELECT id, complaint_id, student_id, title, category, location, assigned_department, status, admin_remarks, updated_at FROM complaints');
  if (complaints.length === 0) {
    console.log('  (No complaints recorded)\n');
  } else {
    console.table(complaints);
  }

  // 4. Complaint Status History Table
  console.log('▶ TABLE: complaint_history');
  const history = query('SELECT id, complaint_id, old_status, new_status, remarks, updated_by, updated_at FROM complaint_history');
  if (history.length === 0) {
    console.log('  (No status history records)\n');
  } else {
    console.table(history);
  }

  // 5. Academic Resources Table
  console.log('▶ TABLE: resources');
  const resources = query('SELECT id, resource_id, title, department, subject, semester, academic_year, original_filename, uploaded_by FROM resources');
  if (resources.length === 0) {
    console.log('  (No academic resources recorded)\n');
  } else {
    console.table(resources);
  }

  console.log('=====================================================================');
  console.log(' Total Records Summary:');
  console.log(` Students: ${students.length} | Admins: ${admins.length} | Complaints: ${complaints.length} | History: ${history.length} | Resources: ${resources.length}`);
  console.log('=====================================================================\n');
}

viewDatabase().catch(err => {
  console.error('Database inspection failed:', err);
  process.exit(1);
});
