/**
 * NAMMA VOICE - My Complaints Client Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'student') {
    window.location.href = '/student-login.html?redirect=/my-complaints.html';
    return;
  }

  // Populate categories filter
  const catFilter = document.getElementById('filter-category');
  if (catFilter && window.APP_CONFIG) {
    catFilter.innerHTML = `
      <option value="">All Categories</option>
      ${window.APP_CONFIG.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
    `;
  }

  setupEventListeners();
  loadMyComplaints();
});

function setupEventListeners() {
  const searchInput = document.getElementById('search-complaints');
  const catSelect = document.getElementById('filter-category');
  const statusSelect = document.getElementById('filter-status');
  const resetBtn = document.getElementById('btn-reset-filters');

  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadMyComplaints, 300);
    });
  }

  if (catSelect) catSelect.addEventListener('change', loadMyComplaints);
  if (statusSelect) statusSelect.addEventListener('change', loadMyComplaints);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (catSelect) catSelect.value = '';
      if (statusSelect) statusSelect.value = '';
      loadMyComplaints();
    });
  }
}

async function loadMyComplaints() {
  const tbody = document.getElementById('complaints-tbody');
  const emptyState = document.getElementById('empty-complaints-state');
  const tableWrap = document.getElementById('complaints-table-wrap');

  if (!tbody) return;

  const search = document.getElementById('search-complaints')?.value.trim() || '';
  const category = document.getElementById('filter-category')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';

  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <span class="spinner-sm" style="border-color: var(--primary); border-top-color: transparent;"></span> Loading your complaints...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (status) params.append('status', status);

    const res = await API.get(`/api/complaints/my?${params.toString()}`);
    const complaints = res.complaints || [];

    if (complaints.length === 0) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (tableWrap) tableWrap.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = complaints.map(c => `
      <tr>
        <td><strong style="color: var(--accent); font-family: monospace; font-size: 0.95rem;">${c.complaint_id}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${c.title}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${c.location}</div>
        </td>
        <td><span class="resource-tag">${c.category}</span></td>
        <td>${API.formatDate(c.created_at)}</td>
        <td>
          <span style="font-weight: 600; color: ${c.assigned_department ? 'var(--primary)' : 'var(--text-muted)'};">
            ${c.assigned_department || 'Unassigned'}
          </span>
        </td>
        <td>${API.getStatusBadge(c.status)}</td>
        <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${API.formatDate(c.updated_at)}</span></td>
        <td>
          <a href="/student-complaint-details.html?id=${c.complaint_id}" class="btn btn-outline-sm">
            View Details
          </a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #dc2626; padding: 1.5rem;">
          Failed to load complaints: ${err.message}
        </td>
      </tr>
    `;
  }
}
