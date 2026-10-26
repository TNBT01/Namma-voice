/**
 * NAMMA VOICE - API Client & Utility Functions
 * Handles communication with Express backend endpoints via Fetch API.
 */

let authUserRequest = null;

const API = {
  /**
   * General request wrapper
   */
  async request(endpoint, options = {}) {
    const defaultHeaders = {};
    if (!(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const config = {
      credentials: 'same-origin',
      headers: {
        ...defaultHeaders,
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.code = data.code;
        error.retryAfterSeconds = Number(response.headers.get('retry-after')) || 0;
        throw error;
      }

      return data;
    } catch (err) {
      console.error('A request to NAMMA VOICE could not be completed.');
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData
    });
  },

  /**
   * Check authenticated user session
   */
  async getAuthUser() {
    if (!authUserRequest) {
      authUserRequest = this.get('/api/auth/me')
        .then(res => res.authenticated ? res.user : null)
        .catch(() => null);
    }
    return authUserRequest;
  },

  /**
   * Perform logout
   */
  async logout() {
    try {
      await this.post('/api/auth/logout', {});
    } catch {
      // Navigation continues even if the session-ending request cannot reach the server.
    } finally {
      window.location.href = '/index.html';
    }
  },

  /**
   * Format ISO date string into readable local format
   */
  formatDate(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  },

  /**
   * Returns HTML for a status badge
   */
  getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase().replace(/\s+/g, '-');
    let badgeClass = 'badge-pending';
    if (s === 'in-progress') badgeClass = 'badge-in-progress';
    if (s === 'resolved') badgeClass = 'badge-resolved';
    return `<span class="status-badge ${badgeClass}"><span class="badge-dot"></span>${this.escapeHtml(status || 'Pending')}</span>`;
  },

  /**
   * Display accessible UI alert message
   */
  showAlert(containerId, message, type = 'error') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const alertClass = type === 'success' ? 'alert-success' : type === 'info' ? 'alert-info' : 'alert-error';
    container.innerHTML = `<div class="alert ${alertClass}" role="${type === 'error' ? 'alert' : 'status'}" aria-live="polite"><span class="alert-icon" aria-hidden="true"></span><div class="alert-content"></div></div>`;
    container.querySelector('.alert-icon').textContent = type === 'success' ? '✓' : type === 'info' ? 'i' : '!';
    container.querySelector('.alert-content').textContent = String(message ?? '');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    container.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  },

  clearAlert(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  },

  /**
   * Set button loading state to prevent double submissions
   */
  setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-sm"></span> ${loadingText}`;
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }
};

window.API = API;
