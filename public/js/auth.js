/** NAMMA VOICE student/admin authentication screens. */

const RESET_EMAIL_KEY = 'nv_reset_email';
const VERIFY_EMAIL_KEY = 'nv_pending_verification_email';
const VERIFY_DELIVERY_STATUS_KEY = 'nv_verify_delivery_status';

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggles();
  setupStrengthIndicators();
  setupStudentRegistration();
  setupStudentLogin();
  setupAdminLogin();
  setupEmailVerification();
  setupForgotPassword();
  setupResetPassword();
});

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password-btn').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      button.textContent = showing ? 'Hide' : 'Show';
      button.setAttribute('aria-label', `${showing ? 'Hide' : 'Show'} password`);
    });
  });
}

function strengthFor(password, email = '') {
  if (password.length < 8) return { level: 'weak', text: 'Weak — use at least 8 characters.' };
  if (new TextEncoder().encode(password).length > 72) return { level: 'weak', text: 'Weak — use 72 UTF-8 bytes or fewer.' };
  const normalized = password.toLowerCase();
  const emailName = email.split('@')[0]?.toLowerCase() || '';
  const common = new Set([
    'password', 'password1', 'password123', 'password@123', 'passw0rd', 'qwerty', 'qwerty123',
    '12345678', '123456789', '1234567890', '11111111', '00000000', '87654321', 'abcdefg',
    'abcdefgh', 'abcd1234', 'letmein', 'welcome', 'welcome123', 'iloveyou', 'admin123',
    'student123', 'college123', 'changeme', 'secret123', 'football', 'monkey123', 'dragon123',
    'sunshine', 'princess', 'india123', 'bangalore123', 'apscollege123'
  ]);
  const stripped = normalized.replace(/[^a-z0-9]/g, '');
  const easyPattern = /^(.)\1{5,}$/.test(stripped) || /^(?:012345|123456|234567|345678|456789|987654|876543|765432|654321|qwerty|asdfgh|zxcvbn)/.test(stripped);
  if (common.has(normalized) || easyPattern || (emailName.length >= 4 && normalized.includes(emailName))) {
    return { level: 'weak', text: 'Weak — this password is common or easy to guess.' };
  }
  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if ((password.length >= 14 && variety >= 3) || (password.length >= 18 && variety >= 2)) {
    return { level: 'strong', text: 'Strong password.' };
  }
  return { level: 'medium', text: 'Medium — meets the minimum; a longer phrase is stronger.' };
}

function updateStrength(input, indicator, emailInput) {
  if (!input || !indicator) return;
  const email = emailInput?.value || (input.id === 'new-password' ? sessionStorage.getItem(RESET_EMAIL_KEY) : '') || '';
  const result = strengthFor(input.value, email);
  const meterValue = result.level === 'strong' ? 3 : result.level === 'medium' ? 2 : 1;
  indicator.dataset.strength = result.level;
  indicator.textContent = input.value ? result.text : 'Password strength will appear as you type.';
  indicator.setAttribute('aria-valuenow', String(input.value ? meterValue : 0));
}

function setupStrengthIndicators() {
  document.querySelectorAll('[data-password-strength]').forEach(indicator => {
    const input = document.getElementById(indicator.dataset.passwordStrength);
    const emailInput = document.getElementById(indicator.dataset.emailField || 'reg-email');
    if (!input) return;
    const refresh = () => updateStrength(input, indicator, emailInput);
    input.addEventListener('input', refresh);
    emailInput?.addEventListener('input', refresh);
    refresh();
  });
}

function setupStudentRegistration() {
  const form = document.getElementById('student-register-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('register-alert');
    const name = document.getElementById('reg-name').value.trim();
    const studentId = document.getElementById('reg-student-id')?.value.trim() || '';
    const emailInput = document.getElementById('reg-email');
    const email = emailInput.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim() || '';
    const department = document.getElementById('reg-department').value;
    const semester = document.getElementById('reg-semester').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (name.length < 2) return API.showAlert('register-alert', 'Please enter your full name (at least 2 characters).');
    if (!emailInput.checkValidity()) return API.showAlert('register-alert', 'Enter a valid email address.');
    if (!department) return API.showAlert('register-alert', 'Please select your course.');
    if (!semester) return API.showAlert('register-alert', 'Please select your current semester.');
    if (strengthFor(password, email).level === 'weak') return API.showAlert('register-alert', strengthFor(password, email).text);
    if (password !== confirmPassword) return API.showAlert('register-alert', 'Passwords do not match.');

    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Creating Account...');
    try {
      const payload = { name, student_id: studentId, email, phone, department, semester, password, confirmPassword };
      const result = await API.post('/api/auth/register', payload);
      if (result.verificationRequired) {
        sessionStorage.setItem(VERIFY_EMAIL_KEY, email);
        sessionStorage.setItem(VERIFY_DELIVERY_STATUS_KEY, result.deliveryStatus || '');
        window.location.href = '/verify-email.html';
        return;
      }
      window.location.href = '/student-login.html?registered=1';
    } catch (error) {
      API.showAlert('register-alert', error.message || 'Registration could not be completed.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });
}

function setupStudentLogin() {
  const form = document.getElementById('student-login-form');
  if (!form) return;
  if (new URLSearchParams(window.location.search).get('registered') === '1') {
    API.showAlert('login-alert', 'Registration successful. You can now log in.', 'success');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('login-alert');
    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;
    if (!email || !password) return API.showAlert('login-alert', 'Enter your college email and password.');
    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Signing In...');
    try {
      await API.post('/api/auth/student/login', { email, password });
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/student-dashboard.html';
      window.location.href = redirect;
    } catch (error) {
      API.showAlert('login-alert', error.message || 'Invalid email or password.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });
}

function setupAdminLogin() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('admin-alert');
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    if (!email || !password) return API.showAlert('admin-alert', 'Enter your administrator email and password.');
    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Verifying Credentials...');
    try {
      await API.post('/api/auth/admin/login', { email, password });
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/admin-dashboard.html';
      window.location.href = redirect;
    } catch (error) {
      API.showAlert('admin-alert', error.message || 'Invalid administrator credentials.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });
}

function startResendCountdown(button, storageKey, seconds = 60) {
  if (!button) return;
  if (!sessionStorage.getItem(storageKey)) sessionStorage.setItem(storageKey, '0');
  const original = button.dataset.label || 'Resend code';
  button.dataset.label = original;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((Number(sessionStorage.getItem(storageKey)) - Date.now()) / 1000));
    button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? `Resend code in ${remaining}s` : original;
    if (remaining > 0) window.setTimeout(tick, 1000);
  };
  tick();
}

function setupEmailVerification() {
  const form = document.getElementById('verify-email-form');
  if (!form) return;
  const controls = document.getElementById('email-verification-controls');
  const disabledMessage = document.getElementById('email-verification-disabled');
  const verificationEnabled = document.body.dataset.emailVerificationEnabled === 'true';
  if (controls) controls.hidden = !verificationEnabled;
  if (disabledMessage) disabledMessage.hidden = verificationEnabled;
  if (!verificationEnabled) return;

  const emailInput = document.getElementById('verify-email-address');
  const pendingEmail = sessionStorage.getItem(VERIFY_EMAIL_KEY);
  if (pendingEmail && emailInput && !emailInput.value) emailInput.value = pendingEmail;
  const deliveryStatus = sessionStorage.getItem(VERIFY_DELIVERY_STATUS_KEY);
  if (deliveryStatus && deliveryStatus !== 'not_confirmed') {
    const message = deliveryStatus === 'provider_accepted'
      ? 'The email provider accepted the verification request, but final inbox delivery is not confirmed. Check your inbox and spam folder; use Resend code if needed.'
      : 'The verification request was accepted by the configured test transport.';
    API.showAlert('verify-email-alert', message, 'info');
    sessionStorage.removeItem(VERIFY_DELIVERY_STATUS_KEY);
  }

  const resendButton = document.getElementById('resend-verification-code');
  startResendCountdown(resendButton, 'nv_verify_resend_after');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('verify-email-alert');
    const email = emailInput.value.trim();
    const otp = document.getElementById('verify-email-otp').value.trim();
    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Verifying...');
    try {
      const result = await API.post('/api/auth/verify-email', { email, otp });
      sessionStorage.removeItem(VERIFY_EMAIL_KEY);
      API.showAlert('verify-email-alert', result.message || 'Email verified. You can now sign in.', 'success');
      form.hidden = true;
      document.getElementById('verification-complete').hidden = false;
    } catch (error) {
      API.showAlert('verify-email-alert', error.message || 'The code could not be verified.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });

  resendButton?.addEventListener('click', async () => {
    API.clearAlert('verify-email-alert');
    if (!emailInput.checkValidity()) return API.showAlert('verify-email-alert', 'Enter the email used for registration.');
    API.setButtonLoading(resendButton, true, 'Requesting...');
    try {
      const result = await API.post('/api/auth/resend-verification-code', { email: emailInput.value.trim() });
      API.showAlert('verify-email-alert', result.message || 'If the account is eligible, a code will be sent.', 'info');
      sessionStorage.setItem('nv_verify_resend_after', String(Date.now() + 60000));
      startResendCountdown(resendButton, 'nv_verify_resend_after');
    } catch (error) {
      API.showAlert('verify-email-alert', error.message || 'Please wait before requesting another code.');
      const retry = Number(error.retryAfterSeconds);
      if (retry > 0) {
        sessionStorage.setItem('nv_verify_resend_after', String(Date.now() + retry * 1000));
        startResendCountdown(resendButton, 'nv_verify_resend_after');
      }
    } finally {
      API.setButtonLoading(resendButton, false);
      startResendCountdown(resendButton, 'nv_verify_resend_after');
    }
  });
}

function setupForgotPassword() {
  const form = document.getElementById('forgot-password-form');
  if (!form) return;
  const emailInput = document.getElementById('forgot-email');
  const codeStep = document.getElementById('forgot-code-step');
  const codeEmail = document.getElementById('forgot-code-email');
  const savedEmail = sessionStorage.getItem(RESET_EMAIL_KEY);
  if (savedEmail && codeStep && codeEmail) {
    codeEmail.value = savedEmail;
    codeStep.hidden = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('forgot-alert');
    if (!emailInput.checkValidity()) return API.showAlert('forgot-alert', 'Enter a valid email address.');
    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Requesting Code...');
    try {
      const result = await API.post('/api/auth/forgot-password', { email: emailInput.value.trim() });
      sessionStorage.setItem(RESET_EMAIL_KEY, emailInput.value.trim());
      sessionStorage.setItem('nv_reset_resend_after', String(Date.now() + 60000));
      codeEmail.value = emailInput.value.trim();
      codeStep.hidden = false;
      API.showAlert('forgot-alert', result.message || 'If an eligible account exists, check its email for a code.', 'info');
      startResendCountdown(document.getElementById('resend-reset-code'), 'nv_reset_resend_after');
    } catch (error) {
      API.showAlert('forgot-alert', error.message || 'Please wait before requesting another code.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });

  const codeForm = document.getElementById('forgot-code-form');
  codeForm?.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('forgot-alert');
    const button = codeForm.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Verifying Code...');
    try {
      const result = await API.post('/api/auth/verify-password-reset', {
        email: codeEmail.value.trim(),
        otp: document.getElementById('forgot-otp').value.trim()
      });
      sessionStorage.setItem(RESET_EMAIL_KEY, codeEmail.value.trim());
      window.location.href = '/reset-password.html';
      API.showAlert('forgot-alert', result.message || 'Code verified.', 'success');
    } catch (error) {
      API.showAlert('forgot-alert', error.message || 'The code could not be verified.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });

  const resendButton = document.getElementById('resend-reset-code');
  startResendCountdown(resendButton, 'nv_reset_resend_after');
  resendButton?.addEventListener('click', async () => {
    API.clearAlert('forgot-alert');
    API.setButtonLoading(resendButton, true, 'Requesting...');
    try {
      const result = await API.post('/api/auth/forgot-password', { email: codeEmail.value.trim() });
      API.showAlert('forgot-alert', result.message || 'If an eligible account exists, check its email for a code.', 'info');
      sessionStorage.setItem('nv_reset_resend_after', String(Date.now() + 60000));
      startResendCountdown(resendButton, 'nv_reset_resend_after');
    } catch (error) {
      API.showAlert('forgot-alert', error.message || 'Please wait before requesting another code.');
      const retry = Number(error.retryAfterSeconds);
      if (retry > 0) sessionStorage.setItem('nv_reset_resend_after', String(Date.now() + retry * 1000));
    } finally {
      API.setButtonLoading(resendButton, false);
      startResendCountdown(resendButton, 'nv_reset_resend_after');
    }
  });
}

function setupResetPassword() {
  const form = document.getElementById('reset-password-form');
  if (!form) return;
  const unverified = document.getElementById('reset-needs-code');
  form.hidden = true;

  API.get('/api/auth/password-reset-session').then(result => {
    if (result.authorized) form.hidden = false;
    else if (unverified) unverified.hidden = false;
  }).catch(() => {
    if (unverified) unverified.hidden = false;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    API.clearAlert('reset-alert');
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    const strength = strengthFor(newPassword, sessionStorage.getItem(RESET_EMAIL_KEY) || '');
    if (strength.level === 'weak') return API.showAlert('reset-alert', strength.text);
    if (newPassword !== confirmPassword) return API.showAlert('reset-alert', 'Passwords do not match.');
    const button = form.querySelector('button[type="submit"]');
    API.setButtonLoading(button, true, 'Updating Password...');
    try {
      const result = await API.post('/api/auth/reset-password', { newPassword, confirmPassword });
      API.showAlert('reset-alert', result.message || 'Password changed successfully.', 'success');
      form.hidden = true;
      sessionStorage.removeItem(RESET_EMAIL_KEY);
      document.getElementById('reset-complete').hidden = false;
    } catch (error) {
      API.showAlert('reset-alert', error.message || 'Password could not be changed. Verify a new code and try again.');
    } finally {
      API.setButtonLoading(button, false);
    }
  });
}
