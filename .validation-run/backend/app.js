/**
 * NAMMA VOICE - Express Application Setup
 * APS College of Arts and Science
 */

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/config.js';
import { pageRequireStudent, pageRequireAdmin } from './middleware/auth.js';
import errorHandler from './middleware/error-handler.js';

import authRoutes from './routes/auth-routes.js';
import studentRoutes from './routes/student-routes.js';
import complaintRoutes from './routes/complaint-routes.js';
import adminRoutes from './routes/admin-routes.js';
import resourceRoutes from './routes/resource-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = config.paths.public;

export const app = express();

// Enable reverse proxy support (Google Cloud Run / load balancers)
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for flexible vanilla HTML/Chart.js CDN integration
    crossOriginEmbedderPolicy: false
  })
);

// CORS
app.use(cors());

// Request Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Server-managed Sessions
app.use(
  session({
    name: 'namma_voice_sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Serve Uploaded Files safely
app.use('/uploads/complaints', express.static(config.paths.complaintUploads));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    application: config.appName,
    college: config.collegeName,
    timestamp: new Date().toISOString()
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resources', resourceRoutes);

// Protected HTML Pages - Student Guard
const studentPages = [
  'student-dashboard.html',
  'submit-complaint.html',
  'my-complaints.html',
  'student-complaint-details.html',
  'student-profile.html'
];

studentPages.forEach((page) => {
  const route = '/' + page;
  const noExtRoute = '/' + page.replace('.html', '');
  
  app.get([route, noExtRoute], pageRequireStudent, (req, res) => {
    res.sendFile(path.join(publicDir, page));
  });
});

// Protected HTML Pages - Admin Guard
const adminPages = [
  'admin-dashboard.html',
  'complaint-management.html',
  'admin-complaint-details.html',
  'admin-profile.html'
];

adminPages.forEach((page) => {
  const route = '/' + page;
  const noExtRoute = '/' + page.replace('.html', '');
  
  app.get([route, noExtRoute], pageRequireAdmin, (req, res) => {
    res.sendFile(path.join(publicDir, page));
  });
});

// Serve Public Static Assets (CSS, JS, Images, Public HTML pages)
app.use(express.static(publicDir));

// Fallback for Root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 Handler for API
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Requested API endpoint not found.'
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
