/**
 * NAMMA VOICE - Central Application Configuration
 * APS College of Arts and Science
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

export const config = {
  // Application Identity & Branding
  appName: 'NAMMA VOICE',
  primarySlogan: 'Namma College. Namma Voice.',
  supportingTagline: 'A student-focused platform for the APS community.',
  collegeName: 'APS College of Arts and Science',
  // Project Credits and Acknowledgements
  credits: {
    departmentHead: 'Dr. Satyashree — Head of the Computer Science Department',
    faculty: 'Associate Professor Manjunath — BCA / Computer Science faculty',
    developer: 'Sathya Prakash — Developer / Project Contributor',
    contributor: 'Kausar Bee S — Project Contributor'
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
    'Hostel',
    'Canteen',
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
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'namma_voice_secure_session_secret_2026_aps_college',
  
  // Storage Paths
  paths: {
    root: projectRoot,
    public: path.join(projectRoot, 'public'),
    database: path.join(projectRoot, process.env.DATABASE_PATH || 'database/namma_voice.sqlite'),
    complaintUploads: path.join(projectRoot, 'uploads/complaints'),
    resourceUploads: path.join(projectRoot, 'uploads/resources')
  },

  // Upload limits
  maxUploadSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 // 5MB
};

export default config;
