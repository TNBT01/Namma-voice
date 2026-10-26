/**
 * NAMMA VOICE - Navigation & Global Layout Script
 * APS College of Arts and Science
 * Handles Responsive Tab Navigation, Role-based Routing, and Bottom Credits
 */

document.addEventListener('DOMContentLoaded', async () => {
  const currentPath = window.location.pathname;

  // Initialize Footer Copyright Year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Check auth user session
  let user = null;
  try {
    user = await API.getAuthUser();
  } catch (err) {
    console.warn('Session check failed:', err);
  }

  updateHeaderNav(user, currentPath);
  setupMobileMenu();
  setupLogoutButtons();
});

function updateHeaderNav(user, currentPath) {
  const navContainer = document.getElementById('main-nav-links');
  const authContainer = document.getElementById('nav-auth-actions');
  const mobileNavLinks = document.getElementById('mobile-nav-links');

  if (!navContainer) return;

  const isCurrent = (path) => {
    return currentPath.endsWith(path) || (path === '/' && (currentPath === '/' || currentPath.endsWith('index.html')))
      ? 'class="nav-link active"'
      : 'class="nav-link"';
  };

  let navLinksHtml = '';
  let authActionsHtml = '';

  if (!user) {
    navLinksHtml = `
      <a href="/index.html" ${isCurrent('/index.html')}>Home</a>
      <a href="/about.html" ${isCurrent('about.html')}>About NAMMA VOICE</a>
      <a href="/index.html#features" class="nav-link">Features</a>
      <a href="/resources.html" ${isCurrent('resources.html')}>Resources</a>
    `;

    authActionsHtml = `
      <a href="/student-login.html" class="btn btn-outline-sm">Student Login</a>
      <a href="/student-register.html" class="btn btn-primary-sm">Register</a>
      <a href="/admin-login.html" class="btn btn-secondary-sm">Admin Login</a>
    `;
  } else if (user.role === 'student') {
    // Student Authenticated Navigation
    navLinksHtml = `
      <a href="/index.html" ${isCurrent('/index.html')}>Home</a>
      <a href="/student-dashboard.html" ${isCurrent('student-dashboard.html')}>Dashboard</a>
      <a href="/submit-complaint.html" ${isCurrent('submit-complaint.html')}>Raise Concern</a>
      <a href="/my-complaints.html" ${isCurrent('my-complaints.html')}>My Complaints</a>
      <a href="/resources.html" ${isCurrent('resources.html')}>Resources</a>
      <a href="/about.html" ${isCurrent('about.html')}>About</a>
    `;

    authActionsHtml = `
      <div class="user-pill">
        <span class="user-avatar">${(user.name || 'S').charAt(0).toUpperCase()}</span>
        <span class="user-name">${user.name || 'Student'}</span>
      </div>
      <a href="/student-profile.html" class="btn btn-outline-sm">Profile</a>
      <button type="button" class="btn btn-secondary-sm btn-logout">Logout</button>
    `;
  } else if (user.role === 'admin') {
    // Administrator Navigation
    navLinksHtml = `
      <a href="/index.html" ${isCurrent('/index.html')}>Home</a>
      <a href="/admin-dashboard.html" ${isCurrent('admin-dashboard.html')}>Dashboard</a>
      <a href="/complaint-management.html" ${isCurrent('complaint-management.html')}>Grievance Management</a>
      <a href="/resources.html" ${isCurrent('resources.html')}>Resources</a>
      <a href="/about.html" ${isCurrent('about.html')}>About</a>
    `;

    authActionsHtml = `
      <div class="user-pill" style="border-color: #cbd5e1;">
        <span class="user-avatar" style="background: var(--college-navy);">A</span>
        <span class="user-name">${user.name || 'Admin'}</span>
      </div>
      <a href="/admin-profile.html" class="btn btn-outline-sm">Profile</a>
      <button type="button" class="btn btn-secondary-sm btn-logout">Logout</button>
    `;
  }

  navContainer.innerHTML = navLinksHtml;
  if (authContainer) authContainer.innerHTML = authActionsHtml;

  if (mobileNavLinks) {
    mobileNavLinks.innerHTML = `
      ${navLinksHtml}
      <div class="mobile-auth-divider"></div>
      ${authActionsHtml}
    `;
  }
}

function setupMobileMenu() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', !isExpanded);
      mobileMenu.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target) && mobileMenu.classList.contains('open')) {
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.classList.remove('active');
      }
    });
  }
}

function setupLogoutButtons() {
  document.addEventListener('click', (e) => {
    if (e.target.matches('.btn-logout') || e.target.closest('.btn-logout')) {
      e.preventDefault();
      API.logout();
    }
  });
}
