/**
 * NAMMA VOICE - Admin Complaint Management Script
 */

let allComplaints = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/admin-login.html';
    return;
  }

  setupFilters();
  loadComplaints();
});

function setupFilters() {
  const catSelect = document.getElementById('filter-category');
  const deptSelect = document.getElementById('filter-dept');

  if (catSelect && window.APP_CONFIG) {
    catSelect.innerHTML = `
      <option value="">All Categories</option>
      ${window.APP_CONFIG.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
    `;
  }

  if (deptSelect && window.APP_CONFIG) {
    deptSelect.innerHTML = `
      <option value="">All Departments</option>
      ${window.APP_CONFIG.departments.map(d => `<option value="${d}">${d}</option>`).join('')}
    `;
  }

  const searchInput = document.getElementById('search-complaints');
  const statusSelect = document.getElementById('filter-status');
  const resetBtn = document.getElementById('btn-reset');

  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadComplaints, 300);
    });
  }

  if (catSelect) catSelect.addEventListener('change', loadComplaints);
  if (deptSelect) deptSelect.addEventListener('change', loadComplaints);
  if (statusSelect) statusSelect.addEventListener('change', loadComplaints);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (catSelect) catSelect.value = '';
      if (deptSelect) deptSelect.value = '';
      if (statusSelect) statusSelect.value = '';
      loadComplaints();
    });
  }
}

async function loadComplaints() {
  const tbody = document.getElementById('complaints-tbody');
  const countEl = document.getElementById('results-count');

  if (!tbody) return;

  const search = document.getElementById('search-complaints')?.value.trim() || '';
  const category = document.getElementById('filter-category')?.value || '';
  const department = document.getElementById('filter-dept')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';

  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <span class="spinner-sm" style="border-color: var(--primary); border-top-color: transparent;"></span> Loading campus complaints...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (department) params.append('department', department);
    if (status) params.append('status', status);

    const res = await API.get(`/api/admin/complaints?${params.toString()}`);
    allComplaints = res.complaints || [];

    if (countEl) countEl.textContent = `${allComplaints.length} complaint${allComplaints.length === 1 ? '' : 's'} found`;

    if (allComplaints.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
            No complaints matching the selected administrative filters.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = allComplaints.map(c => `
      <tr>
        <td><strong style="color: var(--accent); font-family: monospace;">${c.complaint_id}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${c.title}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">📍 ${c.location}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${c.student_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${c.student_reg_id} • ${c.student_department}</div>
        </td>
        <td><span class="resource-tag">${c.category}</span></td>
        <td>
          <span style="font-weight: 600; color: ${c.assigned_department ? 'var(--primary)' : 'var(--text-muted)'};">
            ${c.assigned_department || 'Unassigned'}
          </span>
        </td>
        <td>${API.getStatusBadge(c.status)}</td>
        <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${API.formatDate(c.created_at)}</span></td>
        <td>
          <a href="/admin-complaint-details.html?id=${c.complaint_id}" class="btn btn-primary-sm">
            Manage &amp; Resolve →
          </a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #dc2626; padding: 2rem;">
          Error loading complaints: ${err.message}
        </td>
      </tr>
    `;
  }
}
