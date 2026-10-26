/**
 * NAMMA VOICE - Student Dashboard Client Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'student') {
    window.location.href = '/student-login.html?redirect=/student-dashboard.html';
    return;
  }

  // Update Welcome Message
  const nameEl = document.getElementById('student-greeting-name');
  if (nameEl) nameEl.textContent = user.name || 'Student';

  loadDashboardData();
});

async function loadDashboardData() {
  try {
    const res = await API.get('/api/complaints/my');
    const { stats, complaints } = res;

    // Populate Dynamic Metrics
    document.getElementById('metric-total').textContent = stats.total || 0;
    document.getElementById('metric-pending').textContent = stats.pending || 0;
    document.getElementById('metric-progress').textContent = stats.inProgress || 0;
    document.getElementById('metric-resolved').textContent = stats.resolved || 0;

    // Render Recent Complaints (up to 5)
    const recent = complaints.slice(0, 5);
    const tbody = document.getElementById('recent-complaints-tbody');
    const emptyState = document.getElementById('recent-empty-state');
    const tableContainer = document.getElementById('recent-table-wrap');

    if (recent.length === 0) {
      if (tableContainer) tableContainer.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (tableContainer) tableContainer.style.display = 'block';

      tbody.innerHTML = recent.map(c => `
        <tr>
          <td><strong style="color: var(--accent);">${c.complaint_id}</strong></td>
          <td><strong>${c.title}</strong></td>
          <td><span class="resource-tag">${c.category}</span></td>
          <td>${c.location}</td>
          <td>${API.formatDate(c.created_at)}</td>
          <td>${API.getStatusBadge(c.status)}</td>
          <td>
            <a href="/student-complaint-details.html?id=${c.complaint_id}" class="btn btn-outline-sm">
              View Status →
            </a>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load student dashboard:', err);
    API.showAlert('dashboard-alert', 'Could not fetch complaints data: ' + err.message);
  }
}
