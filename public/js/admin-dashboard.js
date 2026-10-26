/**
 * NAMMA VOICE - Administrator Dashboard Client Script
 * Visualizes Real SQLite Complaint Analytics using Chart.js
 */

let categoryChart = null;
let statusChart = null;
let trendChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/admin-login.html?redirect=/admin-dashboard.html';
    return;
  }

  loadAdminDashboard();
});

async function loadAdminDashboard() {
  try {
    const res = await API.get('/api/admin/dashboard');
    const { stats, charts, recentComplaints = [] } = res;

    // Render Metrics
    document.getElementById('metric-total').textContent = stats.total || 0;
    document.getElementById('metric-pending').textContent = stats.pending || 0;
    document.getElementById('metric-progress').textContent = stats.inProgress || 0;
    document.getElementById('metric-resolved').textContent = stats.resolved || 0;

    // Render Academic Resource Metrics
    const resTotal = stats.totalResources || 0;
    const resByCourse = res.resourcesByCourse || [];
    const bcaCount = (resByCourse.find(r => r.course === 'BCA') || {}).count || 0;
    const bscCount = (resByCourse.find(r => r.course === 'B.Sc') || {}).count || 0;
    const baCount = (resByCourse.find(r => r.course === 'B.A') || {}).count || 0;

    const resTotalEl = document.getElementById('res-metric-total');
    if (resTotalEl) resTotalEl.textContent = resTotal;
    const resBcaEl = document.getElementById('res-metric-bca');
    if (resBcaEl) resBcaEl.textContent = bcaCount;
    const resBscEl = document.getElementById('res-metric-bsc');
    if (resBscEl) resBscEl.textContent = bscCount;
    const resBaEl = document.getElementById('res-metric-ba');
    if (resBaEl) resBaEl.textContent = baCount;

    // Render Recent Academic Resources
    renderRecentResources(res.recentResources || []);

    // Setup Admin Resource Upload Modal
    setupAdminResourceUploadModal();

    // Render Charts
    renderCategoryChart(charts.byCategory || []);
    renderStatusChart(charts.byStatus || []);
    renderTrendChart(charts.monthlyTrends || []);

    // Render only anonymous complaint fields.
    const tbody = document.getElementById('recent-tbody');
    const recentTable = document.getElementById('recent-complaints-table');
    const recentEmpty = document.getElementById('recent-complaints-empty');
    if (tbody) {
      if (recentComplaints.length === 0) {
        tbody.innerHTML = '';
        if (recentTable) recentTable.hidden = true;
        if (recentEmpty) recentEmpty.hidden = false;
      } else {
        if (recentTable) recentTable.hidden = false;
        if (recentEmpty) recentEmpty.hidden = true;
        tbody.innerHTML = recentComplaints.map(c => {
          const attachmentUrl = `/api/admin/complaints/${encodeURIComponent(c.complaint_id || '')}/attachment`;
          const attachment = c.has_attachment
            ? `<a href="${attachmentUrl}" target="_blank" rel="noopener" class="btn btn-outline-sm">View</a> <a href="${attachmentUrl}?download=1" download="complaint-attachment" class="btn btn-outline-sm">Download</a>`
            : '<span class="text-muted">None</span>';
          return `<tr>
            <td><strong class="complaint-reference">${API.escapeHtml(c.complaint_id)}</strong></td>
            <td><strong>${API.escapeHtml(c.title)}</strong></td>
            <td><span class="resource-tag">${API.escapeHtml(c.category)}</span></td>
            <td>${c.assigned_department ? API.escapeHtml(c.assigned_department) : '<span class="text-muted">Unassigned</span>'}</td>
            <td>${API.getStatusBadge(c.status)}</td>
            <td>${API.escapeHtml(API.formatDate(c.created_at))}</td>
            <td>${attachment}</td>
            <td><a href="/admin-complaint-details.html?id=${encodeURIComponent(c.complaint_id)}" class="btn btn-outline-sm">Manage</a></td>
          </tr>`;
        }).join('');
      }
    }

  } catch (err) {
    API.showAlert('admin-dash-alert', 'We could not load the admin dashboard. Please try again.');
  }
}

function renderRecentResources(resources) {
  const tbody = document.getElementById('admin-recent-resources-tbody');
  if (!tbody) return;

  if (resources.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No academic resources uploaded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = resources.map(r => `
    <tr>
      <td><strong style="color: var(--college-navy); font-family: monospace;">${API.escapeHtml(r.resource_id)}</strong></td>
      <td style="font-weight: 600;">${API.escapeHtml(r.title)}</td>
      <td><span class="resource-tag">${API.escapeHtml(r.department)}</span></td>
      <td>${API.escapeHtml(r.subject)}</td>
      <td>${API.escapeHtml(r.semester)}</td>
      <td style="font-size: 0.825rem; color: var(--text-muted);">${API.escapeHtml(r.original_filename)}</td>
      <td style="font-size: 0.825rem;">${API.escapeHtml(API.formatDate(r.created_at))}</td>
      <td>
        <a href="/api/resources/${encodeURIComponent(r.resource_id)}/download" class="btn btn-outline-sm" target="_blank" download>
          Download
        </a>
      </td>
    </tr>
  `).join('');
}

let isModalSetup = false;
function setupAdminResourceUploadModal() {
  if (isModalSetup) return;
  isModalSetup = true;

  const btnOpen = document.getElementById('btn-admin-dash-upload');
  const modal = document.getElementById('admin-upload-resource-modal');
  const btnClose = document.getElementById('btn-close-admin-res-modal');
  const btnCancel = document.getElementById('btn-cancel-admin-res-modal');
  const form = document.getElementById('admin-upload-resource-form');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      modal.classList.add('open');
    });
  }

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      API.clearAlert('admin-res-modal-alert');

      const formData = new FormData(form);
      const submitBtn = form.querySelector('button[type="submit"]');
      API.setButtonLoading(submitBtn, true, 'Uploading Document...');

      try {
        await API.upload('/api/resources', formData);
        closeModal();
        form.reset();
        API.showAlert('admin-dash-alert', 'Academic resource uploaded successfully to repository!', 'success');
        loadAdminDashboard();
      } catch (err) {
        API.showAlert('admin-res-modal-alert', err.message || 'Failed to upload resource.');
      } finally {
        API.setButtonLoading(submitBtn, false);
      }
    });
  }
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('chart-category');
  if (!ctx || typeof Chart === 'undefined') return;

  if (categoryChart) categoryChart.destroy();

  const labels = data.map(d => d.category);
  const counts = data.map(d => d.count);

  categoryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Complaints',
        data: counts,
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function renderStatusChart(data) {
  const ctx = document.getElementById('chart-status');
  if (!ctx || typeof Chart === 'undefined') return;

  if (statusChart) statusChart.destroy();

  const labels = data.map(d => d.status);
  const counts = data.map(d => d.count);
  const colors = data.map(d => d.color);

  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 12 } }
        }
      }
    }
  });
}

function renderTrendChart(data) {
  const ctx = document.getElementById('chart-trend');
  if (!ctx || typeof Chart === 'undefined') return;

  if (trendChart) trendChart.destroy();

  const labels = data.map(d => d.month);
  const counts = data.map(d => d.count);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Complaints Filed',
        data: counts,
        borderColor: '#0f2b48',
        backgroundColor: 'rgba(15, 43, 72, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}


