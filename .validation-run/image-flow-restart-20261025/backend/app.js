/**
 * NAMMA VOICE - Express Application Setup
 * APS College of Arts and Science
 */

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

import { config } from './config/config.js';
import { pageRequireStudent, pageRequireAdmin } from './middleware/auth.js';
import errorHandler from './middleware/error-handler.js';

import authRoutes from './routes/auth-routes.js';
import studentRoutes from './routes/student-routes.js';
import complaintRoutes from './routes/complaint-routes.js';
import adminRoutes from './routes/admin-routes.js';
import resourceRoutes from './routes/resource-routes.js';

const publicDir = config.paths.public;
const publicSitemapPages = ['/', '/about.html', '/courses.html', '/resources.html', '/student-info.html'];
const noIndexPages = new Set([
  'student-login.html', 'student-register.html', 'admin-login.html', 'forgot-password.html', 'reset-password.html',
  'student-dashboard.html', 'submit-complaint.html', 'my-complaints.html', 'student-complaint-details.html', 'student-profile.html',
  'admin-dashboard.html', 'complaint-management.html', 'admin-complaint-details.html', 'admin-profile.html', '404.html'
]);
const protectedPages = [
  'student-dashboard.html', 'submit-complaint.html', 'my-complaints.html', 'student-complaint-details.html', 'student-profile.html',
  'admin-dashboard.html', 'complaint-management.html', 'admin-complaint-details.html', 'admin-profile.html'
];

export const app = express();

function getAbsoluteUrl(route) {
  const base = new URL(config.appBaseUrl);
  return new URL(route, `${base.origin}/`).toString();
}

function setPrivateResponseHeaders(res) {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });
}

function serveHtmlPage(page, req, res, next) {
  const filePath = path.join(publicDir, page);
  fs.promises.readFile(filePath, 'utf8').then(html => {
    const isPrivate = noIndexPages.has(page);
    if (isPrivate) setPrivateResponseHeaders(res);
    else res.set('Cache-Control', 'no-cache');

    const canonicalPath = page === 'index.html' ? '/' : `/${page}`;
    const canonicalUrl = getAbsoluteUrl(canonicalPath);
    res.type('html').send(html
      .replaceAll('__CANONICAL_URL__', canonicalUrl)
      .replaceAll('__SITE_URL__', getAbsoluteUrl('/')));
  }).catch(err => {
    if (err.code === 'ENOENT') return next();
    next(err);
  });
}

// Enable reverse proxy support (Google Cloud Run / load balancers)
app.set('trust proxy', 1);

// Security headers. Complaint attachments are delivered only through owner/admin checked APIs.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
  if (config.nodeEnv === 'production' && !req.secure) {
    const target = new URL(req.originalUrl, `${new URL(config.appBaseUrl).origin}/`);
    return res.redirect(308, target.toString());
  }
  next();
});
app.use(cors());

// Private and user-specific API responses must never be cached or indexed.
app.use('/api', (req, res, next) => {
  setPrivateResponseHeaders(res);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Server-managed Sessions
app.use(session({
  name: 'namma_voice_sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    application: config.appName,
    college: config.collegeName,
    timestamp: new Date().toISOString()
  });
});

// Search engines can crawl only public informational pages.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /uploads/',
    ...protectedPages.flatMap(page => [`Disallow: /${page}`, `Disallow: /${page.replace('.html', '')}`]),
    `Sitemap: ${getAbsoluteUrl('/sitemap.xml')}`
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const urls = publicSitemapPages.map(page => `  <url><loc>${getAbsoluteUrl(page)}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resources', resourceRoutes);

// Protected HTML Pages - Student Guard
const studentPages = [
  'student-dashboard.html', 'submit-complaint.html', 'my-complaints.html',
  'student-complaint-details.html', 'student-profile.html'
];
studentPages.forEach(page => {
  app.get(['/' + page, '/' + page.replace('.html', '')], pageRequireStudent, (req, res, next) => {
    serveHtmlPage(page, req, res, next);
  });
});

// Protected HTML Pages - Admin Guard
const adminPages = ['admin-dashboard.html', 'complaint-management.html', 'admin-complaint-details.html', 'admin-profile.html'];
adminPages.forEach(page => {
  app.get(['/' + page, '/' + page.replace('.html', '')], pageRequireAdmin, (req, res, next) => {
    serveHtmlPage(page, req, res, next);
  });
});

// Render HTML with canonical URLs based on APP_BASE_URL (never a guessed production domain).
app.get('/', (req, res, next) => serveHtmlPage('index.html', req, res, next));
app.get('/404.html', (req, res, next) => {
  res.status(404);
  serveHtmlPage('404.html', req, res, next);
});
app.get('/:page.html', (req, res, next) => serveHtmlPage(`${req.params.page}.html`, req, res, next));

// Cache static assets briefly; HTML and private APIs are not cached.
app.use(express.static(publicDir, {
  maxAge: config.nodeEnv === 'production' ? '1h' : 0,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.html') res.setHeader('Cache-Control', 'no-cache');
  }
}));

// API 404 Handler
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Requested API endpoint not found.' });
});

// Custom not-found page with the correct HTTP status.
app.use((req, res, next) => {
  if (req.accepts('html')) {
    res.status(404);
    return serveHtmlPage('404.html', req, res, () => res.send('Page not found.'));
  }
  res.status(404).json({ success: false, error: 'Page not found.' });
});

app.use(errorHandler);

export default app;
