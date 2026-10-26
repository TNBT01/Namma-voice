/**
 * NAMMA VOICE - Database Initialization & Safe Schema Migration
 * APS College of Arts and Science
 * Creates tables, constraints, foreign keys, indexes, and applies safe migrations.
 */

import { initDatabase, query, run } from './database.js';

export async function createSchema() {
  await initDatabase();

  // 1. Create Students table
  run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      department TEXT NOT NULL,
      semester TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      email_verified INTEGER NOT NULL DEFAULT 0,
      session_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Safe migration for existing databases: check if is_active exists in students
  try {
    const studentCols = query("PRAGMA table_info(students);");
    const hasActiveCol = studentCols.some(c => c.name === 'is_active');
    if (!hasActiveCol) {
      run(`ALTER TABLE students ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
      console.log('✓ Migration applied: Added is_active column to students table');
    }
  } catch (migErr) {
    console.warn('Student table migration check warning:', migErr.message);
  }

  // Existing students remain unverified until they complete email ownership verification.
  const studentColumnNames = new Set(query('PRAGMA table_info(students);').map(column => column.name));
  if (!studentColumnNames.has('email_verified')) run('ALTER TABLE students ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;');
  if (!studentColumnNames.has('session_version')) run('ALTER TABLE students ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;');

  // 2. Create Admins table
  run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Safe migration: check if is_active exists in admins
  try {
    const adminCols = query("PRAGMA table_info(admins);");
    const hasAdminActive = adminCols.some(c => c.name === 'is_active');
    if (!hasAdminActive) {
      run(`ALTER TABLE admins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
      console.log('✓ Migration applied: Added is_active column to admins table');
    }
  } catch (migErr) {
    console.warn('Admin table migration check warning:', migErr.message);
  }

  const adminColumnNames = new Set(query('PRAGMA table_info(admins);').map(column => column.name));
  if (!adminColumnNames.has('session_version')) run('ALTER TABLE admins ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;');

  // 3. Create Complaints table
  run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT UNIQUE NOT NULL,
      student_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      attachment_path TEXT,
      assigned_department TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  // 4. Create Complaint Status History table
  run(`
    CREATE TABLE IF NOT EXISTS complaint_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      remarks TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );
  `);

  // 5. Create Academic Resources table
  run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      subject TEXT NOT NULL,
      semester TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 6. Create Password Reset Tokens table (Secure single-use tokens)
  run(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_type TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS auth_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_type TEXT NOT NULL CHECK (user_type IN ('student', 'admin')),
      purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      reset_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      consumed_at TEXT
    );
  `);

  const otpColumnNames = new Set(query('PRAGMA table_info(auth_otps);').map(column => column.name));
  if (!otpColumnNames.has('reset_completed')) run('ALTER TABLE auth_otps ADD COLUMN reset_completed INTEGER NOT NULL DEFAULT 0;');

  run(`
    CREATE TABLE IF NOT EXISTS auth_otp_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_hash TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
      requested_at TEXT NOT NULL
    );
  `);

  // 7. Create Audit Logs table for Administrative Actions
  run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 8. Create Performance & Lookup Indexes
  run(`CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);`);
  run(`CREATE INDEX IF NOT EXISTS idx_students_reg ON students(student_id);`);
  run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_normalized ON students(LOWER(TRIM(email)));`);
  run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_reg_normalized ON students(LOWER(TRIM(student_id)));`);
  run(`CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_student_id ON complaints(student_id);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_student_created ON complaints(student_id, created_at DESC, id DESC);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_created_id ON complaints(created_at DESC, id DESC);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaints_department ON complaints(assigned_department);`);
  run(`CREATE INDEX IF NOT EXISTS idx_complaint_history_cid ON complaint_history(complaint_id);`);
  run(`CREATE INDEX IF NOT EXISTS idx_resources_dept_sem ON resources(department, semester);`);
  run(`CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);`);
  run(`CREATE INDEX IF NOT EXISTS idx_auth_otps_lookup ON auth_otps(user_type, user_id, purpose, created_at DESC);`);
  run(`CREATE INDEX IF NOT EXISTS idx_auth_otps_expiry ON auth_otps(expires_at);`);
  run(`CREATE INDEX IF NOT EXISTS idx_auth_otp_requests_scope ON auth_otp_requests(email_hash, purpose, requested_at DESC);`);
  run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);`);

  console.log('✓ SQLite schema, migrations, and indexes verified successfully.');
}

export default createSchema;
