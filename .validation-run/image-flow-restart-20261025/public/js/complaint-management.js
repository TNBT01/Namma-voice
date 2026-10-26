/** NAMMA VOICE administrator complaint management. */

const COMPLAINTS_PAGE_SIZE = 25;
let complaintsPage = 1;
let complaintsRequestId = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/admin-login.html';
    return;
  }

  setupFilters();
  setupPagination();
  loadComplaints();
});

function setupFilters() {
  const categorySelect = document.getElementById('filter-category');
  const departmentSelect = document.getElementById('filter-dept');
  const searchInput = document.getElementById('search-complaints');
  const filterIds = ['filter-category', 'filter-dept', 'filter-status', 'filter-sort'];

  if (categorySelect && window.APP_CONFIG) {
    categorySelect.innerHTML = '<option value="">All Categories</option>' +
      window.APP_CONFIG.categories.map(category =>
        `<option value="${API.escapeHtml(category)}">${API.escapeHtml(category)}</option>`
      ).join('');
  }
  if (departmentSelect && window.APP_CONFIG) {
    departmentSelect.innerHTML = '<option value="">All Departments</option>' +
      window.APP_CONFIG.departments.map(department =>
        `<option value="${API.escapeHtml(department)}">${API.escapeHtml(department)}</option>`
      ).join('');
  }

  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        complaintsPage = 1;
        loadComplaints();
      }, 250);
    });
  }
  filterIds.forEach(id => {
    const control = document.getElementById(id);
    if (control) control.addEventListener('change', () => {
      complaintsPage = 1;
      loadComplaints();
    });
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    filterIds.forEach(id => {
      const control = document.getElementById(id);
      if (control) control.value = id === 'filter-sort' ? 'newest' : '';
    });
    complaintsPage = 1;
    loadComplaints();
  });
}

function setupPagination() {
  document.getElementById('complaints-prev')?.addEventListener('click', () => {
    if (complaintsPage > 1) {
      complaintsPage -= 1;
      loadComplaints();
    }
  });
  document.getElementById('complaints-next')?.addEventListener('click', () => {
    complaintsPage += 1;
    loadComplaints();
  });
}

function readFilters() {
  return {
    search: document.getElementById('search-complaints')?.value.trim() || '',
    category: document.getElementById('filter-category')?.value || '',
    department: document.getElementById('filter-dept')?.value || '',
    status: document.getElementById('filter-status')?.value || '',
    sort: document.getElementById('filter-sort')?.value || 'newest'
  };
}

async function loadComplaints() {
  const tbody = document.getElementById('complaints-tbody');
  const count = document.getElementById('results-count');
  if (!tbody) return;

  const requestId = ++complaintsRequestId;
  const filters = readFilters();
  const params = new URLSearchParams({
    page: String(complaintsPage),
    pageSize: String(COMPLAINTS_PAGE_SIZE),
    sort: filters.sort
  });
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== 'sort') params.set(key, value);
  });

  API.clearAlert('complaints-alert');
  if (count) count.textContent = 'Loading complaints...';
  tbody.innerHTML = '<tr><td colspan="8" class="table-message">Loading complaints...</td></tr>';
  document.getElementById('complaints-table-wrap').hidden = false;
  document.getElementById('complaints-empty-state').hidden = true;

  try {
    const response = await API.get(`/api/admin/complaints?${params.toString()}`);
    if (requestId !== complaintsRequestId) return;

    const complaints = response.complaints || [];
    const pagination = response.pagination || {
      page: complaintsPage,
      pageSize: COMPLAINTS_PAGE_SIZE,
      total: complaints.length,
      totalPages: complaints.length ? 1 : 0,
      hasPrevious: false,
      hasNext: false
    };

    if (count) {
      const start = pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0;
      const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
      count.textContent = pagination.total ? `Showing ${start}-${end} of ${pagination.total}` : '0 complaints';
    }

    if (!complaints.length) {
      document.getElementById('complaints-table-wrap').hidden = true;
      const emptyState = document.getElementById('complaints-empty-state');
      const hasFilters = Boolean(filters.search || filters.category || filters.department || filters.status);
      emptyState.querySelector('.empty-state-title').textContent = hasFilters
        ? 'No complaints match these filters.'
        : 'No complaints have been submitted yet.';
      emptyState.querySelector('.empty-state-text').textContent = hasFilters
        ? 'Try changing or clearing the selected filters.'
        : 'New complaints will appear here.';
      emptyState.hidden = false;
      renderPagination(pagination);
      return;
    }

    tbody.innerHTML = complaints.map(renderComplaintRow).join('');
    complaintsPage = pagination.page;
    renderPagination(pagination);
  } catch {
    if (requestId !== complaintsRequestId) return;
    tbody.innerHTML = '';
    document.getElementById('complaints-table-wrap').hidden = true;
    document.getElementById('complaints-empty-state').hidden = true;
    if (count) count.textContent = '';
    API.showAlert('complaints-alert', 'We could not load complaints. Please try again.');
  }
}

function renderComplaintRow(complaint) {
  const safe = value => API.escapeHtml(value ?? '');
  const id = safe(complaint.complaint_id);
  const href = `/admin-complaint-details.html?id=${encodeURIComponent(complaint.complaint_id || '')}`;
  const department = complaint.assigned_department
    ? safe(complaint.assigned_department)
    : '<span class="text-muted">Unassigned</span>';
  const date = safe(API.formatDate(complaint.created_at));
  const attachmentUrl = `/api/admin/complaints/${encodeURIComponent(complaint.complaint_id || '')}/attachment`;
  const attachment = complaint.has_attachment
    ? `<div class="complaint-attachment-actions"><a href="${attachmentUrl}" target="_blank" rel="noopener" class="btn btn-outline-sm" aria-label="View attachment for ${id}">View</a><a href="${attachmentUrl}?download=1" class="btn btn-outline-sm">Download</a></div>`
    : '<span class="text-muted">None</span>';

  return `
    <tr>
      <td><strong class="complaint-reference">${id}</strong></td>
      <td><strong>${safe(complaint.title)}</strong></td>
      <td><span class="resource-tag">${safe(complaint.category)}</span></td>
      <td>${department}</td>
      <td><time datetime="${safe(complaint.created_at)}">${date}</time></td>
      <td>${API.getStatusBadge(complaint.status)}</td>
      <td>${attachment}</td>
      <td><a href="${href}" class="btn btn-primary-sm">Open</a></td>
    </tr>`;
}

function renderPagination(pagination) {
  const nav = document.getElementById('complaint-pagination');
  const previous = document.getElementById('complaints-prev');
  const next = document.getElementById('complaints-next');
  const pageStatus = document.getElementById('complaints-page-status');
  if (!nav || !previous || !next || !pageStatus) return;

  nav.hidden = pagination.totalPages <= 1;
  previous.disabled = !pagination.hasPrevious;
  next.disabled = !pagination.hasNext;
  pageStatus.textContent = `Page ${pagination.page} of ${Math.max(1, pagination.totalPages)}`;
}
