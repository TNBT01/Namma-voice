/**
 * NAMMA VOICE - Central Application Configuration
 * APS College of Arts and Science
 */

import path from 'path';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(projectRoot, '.env') });
const nodeEnv = process.env.NODE_ENV || 'development';
const configuredSessionSecret = process.env.SESSION_SECRET;
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const testUploadsRoot = nodeEnv === 'test' && process.env.TEST_UPLOADS_DIR
  ? path.resolve(projectRoot, process.env.TEST_UPLOADS_DIR)
  : null;
if (nodeEnv === 'production' && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET must be configured as a unique value of at least 32 characters in production.');
}
if (nodeEnv === 'production' && new URL(appBaseUrl).protocol !== 'https:') {
  throw new Error('APP_BASE_URL must use HTTPS in production.');
}
const sessionSecret = configuredSessionSecret || randomBytes(32).toString('hex');

export const config = {
  // Application Identity & Branding
  appName: 'NAMMA VOICE',
  primarySlogan: 'Namma College. Namma Voice.',
  supportingTagline: 'A student-focused platform for the APS community.',
  collegeName: 'APS College of Arts and Science',
  // Project Credits and Acknowledgements
  credits: {
    departmentHead: 'Dr. Satyashree Ma’am — Head of the Computer Science Department',
    faculty: 'Associate Professor Manjunath Sir — BCA / Computer Science Faculty',
    developer: 'Sathya Prakash R (Final Year BCA) — Full-Stack Developer & Project Lead Coordinator',
    contributor: 'Kausar Bee S (Final Year BCA) — Project Contributor'
  },

  // College Courses Offered (Only BCA, B.Sc, B.A)
  courses: [
    { code: 'BCA', name: 'Bachelor of Computer Applications', duration: '3 Years (6 Semesters)', description: 'Comprehensive program in software development, database systems, web programming, algorithms, and cloud computing.' },
    { code: 'B.Sc', name: 'Bachelor of Science', duration: '3 Years (6 Semesters)', description: 'Scientific disciplines integrating practical laboratories, mathematics, physics, electronics, and computer science.' },
    { code: 'B.A', name: 'Bachelor of Arts', duration: '3 Years (6 Semesters)', description: 'Humanities curriculum focusing on critical analysis, history, economics, literature, and social sciences.' }
  ],

  // Supported Categories for Complaints
  categories: [
    'Classroom',
    'Laboratory',
    'Library',
    'Infrastructure',
    'Washroom',
    'Sports',
    'Electrical',
    'Other'
  ],

  // Supported Administrative Departments
  departments: [
    'Administration',
    'Maintenance',
    'IT Department',
    'Library',
    'Hostel Management',
    'Canteen',
    'Sports Department',
    'Laboratory',
    'Other'
  ],

  // Allowed Complaint Statuses
  statuses: ['Pending', 'In Progress', 'Resolved'],

  // Academic Courses Offered (Strictly BCA, B.Sc, B.A)
  academicDepartments: [
    'BCA',
    'B.Sc',
    'B.A'
  ],

  // Semesters
  semesters: ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6'],

  // Server & Environment
  port: process.env.PORT || 3000,
  appBaseUrl,
  nodeEnv,
  sessionSecret,
  // Registration email OTP is disabled by default until a verified email provider is ready.
  // Set EMAIL_VERIFICATION_ENABLED=true to reactivate the existing OTP registration flow.
  auth: {
    emailVerificationEnabled: process.env.EMAIL_VERIFICATION_ENABLED === 'true'
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend',
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || '',
    fromName: (process.env.EMAIL_FROM_NAME || 'NAMMA VOICE').replace(/[<>\r\n]/g, '').trim(),
    allowedStudentDomains: (process.env.STUDENT_EMAIL_DOMAINS || '')
      .split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean)
  },
  
  // Storage Paths
  paths: {
    root: projectRoot,
    public: path.join(projectRoot, 'public'),
    database: path.join(projectRoot, process.env.DATABASE_PATH || 'database/namma_voice.sqlite'),
    complaintUploads: testUploadsRoot ? path.join(testUploadsRoot, 'complaints') : path.join(projectRoot, 'uploads/complaints'),
    resourceUploads: testUploadsRoot ? path.join(testUploadsRoot, 'resources') : path.join(projectRoot, 'uploads/resources')
  },

  // Upload limits
  maxUploadSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 // 5MB
};

export default config;
