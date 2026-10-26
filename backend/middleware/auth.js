import { get } from '../database/database.js';
import { config } from '../config/config.js';

function currentSessionAccount(req) {
  const user = req.session?.user;
  if (!user || !['student', 'admin'].includes(user.role)) return null;
  const table = user.role === 'student' ? 'students' : 'admins';
  const columns = user.role === 'student' ? 'id, is_active, email_verified, session_version' : 'id, is_active, session_version';
  const account = get(`SELECT ${columns} FROM ${table} WHERE id = ?`, [user.id]);
  if (!account || account.is_active !== 1) return null;
  if (config.auth.emailVerificationEnabled && user.role === 'student' && account.email_verified !== 1) return null;
  if (Number(req.session.authVersion) !== Number(account.session_version)) return null;
  return user;
}

function clearExpiredSession(req, res) {
  if (req.session) req.session.destroy(() => {});
  res.clearCookie('namma_voice_sid');
}

export function requireAuth(req, res, next) {
  const user = currentSessionAccount(req);
  if (user) return next();
  if (req.session?.user) clearExpiredSession(req, res);
  return res.status(401).json({ success: false, error: 'Authentication required. Please log in to continue.' });
}

export function requireRole(role) {
  return (req, res, next) => {
    const user = currentSessionAccount(req);
    if (!user) {
      if (req.session?.user) clearExpiredSession(req, res);
      return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    }
    if (user.role !== role) {
      return res.status(403).json({ success: false, error: `Access denied. Requires ${role} privileges.` });
    }
    next();
  };
}

export function pageRequireStudent(req, res, next) {
  const user = currentSessionAccount(req);
  if (user?.role === 'student') return next();
  if (req.session?.user) clearExpiredSession(req, res);
  return res.redirect('/student-login.html?redirect=' + encodeURIComponent(req.originalUrl));
}

export function pageRequireAdmin(req, res, next) {
  const user = currentSessionAccount(req);
  if (user?.role === 'admin') return next();
  if (req.session?.user) clearExpiredSession(req, res);
  return res.redirect('/admin-login.html?redirect=' + encodeURIComponent(req.originalUrl));
}
