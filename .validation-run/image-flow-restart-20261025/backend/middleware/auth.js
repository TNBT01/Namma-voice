/**
 * NAMMA VOICE - Authentication & Authorization Middleware
 * Enforces session-based role verification and ownership checks.
 */

/**
 * Middleware ensuring user is authenticated (either student or admin).
 */
export function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: 'Authentication required. Please log in to continue.'
  });
}

/**
 * Middleware ensuring user has a specific role ('student' or 'admin').
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    if (req.session.user.role !== role) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires ${role} privileges.`
      });
    }

    next();
  };
}

/**
 * Protect HTML page routes for students.
 * Redirects to student-login.html if unauthorized.
 */
export function pageRequireStudent(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'student') {
    return next();
  }
  return res.redirect('/student-login.html?redirect=' + encodeURIComponent(req.originalUrl));
}

/**
 * Protect HTML page routes for administrators.
 * Redirects to admin-login.html if unauthorized.
 */
export function pageRequireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.redirect('/admin-login.html?redirect=' + encodeURIComponent(req.originalUrl));
}
