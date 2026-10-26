/**
 * NAMMA VOICE - Admin Complaint Details & Resolution Script
 */

let currentComplaint = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/admin-login.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const complaintId = urlParams.get('id');

  if (!complaintId) {
    API.showAlert('admin-detail-alert', 'No complaint identifier specified.');
    return;
  }

  // Populate department choices in update form
  const deptSelect = document.getElementById('update-department');
  if (deptSelect && window.APP_CONFIG) {
    deptSelect.innerHTML = `
      <option value="">Unassigned</option>
      ${window.APP_CONFIG.departments.map(d => `<option value="${d}">${d}</option>`).join('')}
    `;
  }

  setupUpdateForm(complaintId);
  setupQuickResolveBtn(complaintId);
  loadComplaint(complaintId);
});

async function loadComplaint(id) {
  try {
    const res = await API.get(`/api/admin/complaints/${id}`);
    currentComplaint = res.complaint;
    const c = currentComplaint;

    // Header & Meta
    document.getElementById('header-complaint-id').textContent = c.complaint_id;
    document.getElementById('complaint-title').textContent = c.title;
    document.getElementById('complaint-category').textContent = c.category;
    document.getElementById('complaint-location').textContent = c.location;
    document.getElementById('complaint-submitted').textContent = API.formatDate(c.created_at);
    document.getElementById('complaint-updated').textContent = API.formatDate(c.updated_at);
    document.getElementById('complaint-status-badge').innerHTML = API.getStatusBadge(c.status);
    document.getElementById('complaint-description').textContent = c.description;

    // Attachment
    const attachWrap = document.getElementById('attachment-wrap');
    const attachImg = document.getElementById('attachment-img');
    if (c.has_attachment) {
      const attachmentUrl = `/api/admin/complaints/${encodeURIComponent(c.complaint_id)}/attachment`;
      const attachmentActions = document.getElementById('attachment-actions');
      const missingMessage = document.getElementById('attachment-missing');
      document.getElementById('attachment-view').href = attachmentUrl;
      document.getElementById('attachment-download').href = `${attachmentUrl}?download=1`;
      missingMessage.hidden = true;
      attachmentActions.hidden = false;
      attachImg.onerror = () => {
        attachImg.hidden = true;
        attachmentActions.hidden = true;
        missingMessage.hidden = false;
      };
      attachImg.onload = () => {
        attachImg.hidden = false;
        missingMessage.hidden = true;
        attachmentActions.hidden = false;
      };
      attachImg.hidden = false;
      attachImg.src = attachmentUrl;
      attachWrap.style.display = 'block';
    } else {
      attachImg.onerror = null;
      attachImg.onload = null;
      attachImg.removeAttribute('src');
      attachImg.hidden = false;
      document.getElementById('attachment-actions').hidden = true;
      document.getElementById('attachment-missing').hidden = true;
      attachWrap.style.display = 'none';
    }

    // Populate Update Form Inputs
    const deptSelect = document.getElementById('update-department');
    const statusSelect = document.getElementById('update-status');
    const remarksInput = document.getElementById('update-remarks');

    if (deptSelect) deptSelect.value = c.assigned_department || '';
    if (statusSelect) statusSelect.value = c.status;
    if (remarksInput) remarksInput.value = c.admin_remarks || '';

    // Render Timeline
    renderTimeline(c.history || []);
  } catch (err) {
    API.showAlert('admin-detail-alert', 'We could not load this complaint. Please return to the complaint list and try again.');
    document.getElementById('content-area').style.display = 'none';
  }
}

function renderTimeline(history) {
  const container = document.getElementById('timeline-track');
  if (!container) return;

  if (history.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted);">No history logged.</div>';
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
            ${API.escapeHtml(item.new_status)}
            ${item.old_status ? `<span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">(from ${API.escapeHtml(item.old_status)})</span>` : ''}
          </div>
          <div class="timeline-date">${API.escapeHtml(API.formatDate(item.updated_at))}</div>
        </div>
        ${item.remarks ? `
          <div class="timeline-remarks">
            <strong>${API.escapeHtml(item.updated_by)}:</strong> ${API.escapeHtml(item.remarks)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function setupUpdateForm(complaintId) {
  const form = document.getElementById('admin-update-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('action-alert');

    const assigned_department = document.getElementById('update-department').value;
    const status = document.getElementById('update-status').value;
    const admin_remarks = document.getElementById('update-remarks').value.trim();

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Saving Administrative Update...');

    try {
      const res = await API.patch(`/api/admin/complaints/${complaintId}`, {
        assigned_department: assigned_department || null,
        status,
        admin_remarks: admin_remarks || null
      });

      API.showAlert('action-alert', 'Complaint updated and logged into resolution timeline!', 'success');
      loadComplaint(complaintId);
    } catch (err) {
      API.showAlert('action-alert', 'We could not save the update. Please try again.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}

function setupQuickResolveBtn(complaintId) {
  const quickBtn = document.getElementById('btn-quick-resolve');
  if (!quickBtn) return;

  quickBtn.addEventListener('click', async () => {
    const remarks = prompt('Enter final resolution verification remarks (e.g. Maintenance inspected and repaired facility):');
    if (remarks === null) return; // User cancelled prompt

    try {
      await API.patch(`/api/admin/complaints/${complaintId}`, {
        status: 'Resolved',
        admin_remarks: remarks.trim() || 'Issue verified and marked as Resolved by Administration.'
      });

      API.showAlert('action-alert', 'Complaint successfully marked as Resolved!', 'success');
      loadComplaint(complaintId);
    } catch (err) {
      alert('Failed to resolve complaint: ' + err.message);
    }
  });
}
