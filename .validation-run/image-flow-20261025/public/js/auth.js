/**
 * NAMMA VOICE - Authentication Client Script
 * APS College of Arts and Science
 * Handles Student Registration, Student Login, Admin Login,
 * Password Visibility Toggles, Forgot Password, and Password Reset.
 */

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggles();
  setupStudentRegistration();
  setupStudentLogin();
  setupAdminLogin();
  setupForgotPassword();
  setupResetPassword();
});

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '👁️';
        btn.setAttribute('aria-label', 'Hide password');
      } else {
        input.type = 'password';
        btn.innerHTML = '👁️‍🗨️';
        btn.setAttribute('aria-label', 'Show password');
      }
    });
  });
}

function setupStudentRegistration() {
  const form = document.getElementById('student-register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('register-alert');

    const name = document.getElementById('reg-name').value.trim();
    const studentIdInput = document.getElementById('reg-student-id');
    const studentId = studentIdInput ? studentIdInput.value.trim() : '';
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone') ? document.getElementById('reg-phone').value.trim() : '';
    const department = document.getElementById('reg-department').value;
    const semester = document.getElementById('reg-semester').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (!name || name.length < 2) {
      return API.showAlert('register-alert', 'Please enter your full name (minimum 2 characters).');
    }
    if (!email || !email.includes('@')) {
      return API.showAlert('register-alert', 'Please enter a valid email address.');
    }
    if (!department) {
      return API.showAlert('register-alert', 'Please select your academic course (BCA, B.Sc, or B.A).');
    }
    if (!semester) {
      return API.showAlert('register-alert', 'Please select your current semester.');
    }
    if (password.length < 6) {
      return API.showAlert('register-alert', 'Password must be at least 6 characters long.');
    }
    if (password !== confirmPassword) {
      return API.showAlert('register-alert', 'Passwords do not match. Please re-enter.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Creating Student Account...');

    try {
      const payload = {
        name,
        email,
        phone,
        department,
        semester,
        password,
        confirmPassword
      };
      if (studentId) {
        payload.student_id = studentId;
      }

      await API.post('/api/auth/register', payload);

      API.showAlert('register-alert', 'Account created successfully! Redirecting to student dashboard...', 'success');
      setTimeout(() => {
        window.location.href = '/student-dashboard.html';
      }, 1000);
    } catch (err) {
      API.showAlert('register-alert', err.message || 'Registration failed. Please try again.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}

function setupStudentLogin() {
  const form = document.getElementById('student-login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('login-alert');

    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;

    if (!email || !password) {
      return API.showAlert('login-alert', 'Please enter both your college email address and password.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Signing In...');

    try {
      await API.post('/api/auth/student/login', { email, password });
      API.showAlert('login-alert', 'Login successful! Opening dashboard...', 'success');

      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect') || '/student-dashboard.html';
      setTimeout(() => {
        window.location.href = redirect;
      }, 700);
    } catch (err) {
      API.showAlert('login-alert', err.message || 'Invalid email or password.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}

function setupAdminLogin() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('admin-alert');

    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      return API.showAlert('admin-alert', 'Please enter your administrator email and password.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Verifying Credentials...');

    try {
      await API.post('/api/auth/admin/login', { email, password });
      API.showAlert('admin-alert', 'Administrator authentication successful! Opening admin console...', 'success');

      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect') || '/admin-dashboard.html';
      setTimeout(() => {
        window.location.href = redirect;
      }, 700);
    } catch (err) {
      API.showAlert('admin-alert', err.message || 'Invalid administrator credentials.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}

function setupForgotPassword() {
  const form = document.getElementById('forgot-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('forgot-alert');

    const email = document.getElementById('forgot-email').value.trim();
    if (!email || !email.includes('@')) {
      return API.showAlert('forgot-alert', 'Please enter a valid college email address.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Processing Request...');

    try {
      const res = await API.post('/api/auth/forgot-password', { email });
      API.showAlert(
        'forgot-alert',
        res.message || 'If an account exists for that email, password-reset instructions have been sent.',
        'success'
      );
      form.reset();
    } catch (err) {
      API.showAlert('forgot-alert', err.message || 'Unable to process password reset request.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}

function setupResetPassword() {
  const form = document.getElementById('reset-password-form');
  if (!form) return;

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const tokenInput = document.getElementById('reset-token');

  if (token && tokenInput) {
    tokenInput.value = token;
  }

  if (!token) {
    API.showAlert(
      'reset-alert',
      'Missing or invalid password reset link. Please request a new link from the Forgot Password page.',
      'error'
    );
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('reset-alert');

    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;

    if (!newPassword || newPassword.length < 6) {
      return API.showAlert('reset-alert', 'New password must be at least 6 characters long.');
    }

    if (newPassword !== confirmNewPassword) {
      return API.showAlert('reset-alert', 'Passwords do not match. Please verify both fields.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Updating Password...');

    try {
      const res = await API.post('/api/auth/reset-password', {
        token: token.trim(),
        newPassword,
        confirmPassword: confirmNewPassword
      });

      API.showAlert('reset-alert', res.message || 'Password successfully updated! Redirecting to login...', 'success');
      form.reset();
      setTimeout(() => {
        window.location.href = '/student-login.html';
      }, 1500);
    } catch (err) {
      API.showAlert('reset-alert', err.message || 'Failed to reset password. Link may have expired.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}
