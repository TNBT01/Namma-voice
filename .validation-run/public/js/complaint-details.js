/**
 * NAMMA VOICE - Student Complaint Details Script
 * Displays complaint metadata, photo attachment, and chronological status history timeline.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'student') {
    window.location.href = '/student-login.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const complaintId = urlParams.get('id');

  if (!complaintId) {
    API.showAlert('details-alert', 'No complaint identifier specified in request.');
    return;
  }

  loadComplaintDetails(complaintId);
});

async function loadComplaintDetails(id) {
  try {
    const res = await API.get(`/api/complaints/${id}`);
    const c = res.complaint;

    document.getElementById('complaint-id-header').textContent = c.complaint_id;
    document.getElementById('detail-id').textContent = c.complaint_id;
    document.getElementById('detail-title').textContent = c.title;
    document.getElementById('detail-category').textContent = c.category;
    document.getElementById('detail-location').textContent = c.location;
    document.getElementById('detail-submitted').textContent = API.formatDate(c.created_at);
    document.getElementById('detail-updated').textContent = API.formatDate(c.updated_at);
    document.getElementById('detail-department').textContent = c.assigned_department || 'Pending Departmental Assignment';
    document.getElementById('detail-status-badge').innerHTML = API.getStatusBadge(c.status);
    document.getElementById('detail-description').textContent = c.description;

    // Admin remarks
    const remarksBox = document.getElementById('admin-remarks-box');
    const remarksText = document.getElementById('admin-remarks-text');
    if (c.admin_remarks) {
      remarksText.textContent = c.admin_remarks;
      remarksBox.style.display = 'block';
    } else {
      remarksBox.style.display = 'none';
    }

    // Attachment
    const attachWrap = document.getElementById('detail-attachment-wrap');
    const attachImg = document.getElementById('detail-attachment-img');
    if (c.attachment_path) {
      attachImg.src = c.attachment_path;
      attachWrap.style.display = 'block';
    } else {
      attachWrap.style.display = 'none';
    }

    // Render Chronological Status History Timeline
    renderTimeline(c.history || [], c.status);
  } catch (err) {
    API.showAlert('details-alert', err.message || 'Unable to load complaint details. Please check access permissions.');
    document.getElementById('details-content-card').style.display = 'none';
  }
}

function renderTimeline(history, currentStatus) {
  const container = document.getElementById('timeline-track');
  if (!container) return;

  if (history.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No status history recorded yet.</div>';
    return;
  }

  container.innerHTML = history.map((item, index) => {
    const isLatest = index === history.length - 1;
    const isCompleted = item.new_status === 'Resolved';
    const stepClass = isCompleted ? 'timeline-step completed' : isLatest ? 'timeline-step active' : 'timeline-step';

    return `
      <div class="${stepClass}">
        <div class="timeline-node"></div>
        <div class="timeline-header">
          <div class="timeline-step-name">
            ${item.new_status}
            ${item.old_status ? `<span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">(Transitioned from ${item.old_status})</span>` : ''}
          </div>
          <div class="timeline-date">${API.formatDate(item.updated_at)}</div>
        </div>
        ${item.remarks ? `
          <div class="timeline-remarks">
            <strong>${item.updated_by}:</strong> ${item.remarks}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
