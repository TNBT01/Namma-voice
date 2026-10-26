/**
 * NAMMA VOICE - Student Academic Resources Client Script
 * APS College of Arts and Science
 * Handles Course Filters (Strictly BCA, B.Sc, B.A), Searches, Downloads, and Admin Modal
 */

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await API.getAuthUser();
  setupAdminControls();
  setupFilters();

  // Check URL query parameters (e.g. ?department=BCA)
  const urlParams = new URLSearchParams(window.location.search);
  const deptParam = urlParams.get('department');
  if (deptParam) {
    const deptSelect = document.getElementById('resource-dept');
    if (deptSelect) deptSelect.value = deptParam;
  }

  loadResources();
});

function setupAdminControls() {
  const adminUploadBtn = document.getElementById('btn-open-upload-modal');
  const uploadModal = document.getElementById('upload-resource-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const uploadForm = document.getElementById('upload-resource-form');

  if (currentUser && currentUser.role === 'admin') {
    if (adminUploadBtn) adminUploadBtn.style.display = 'inline-flex';
  }

  if (adminUploadBtn && uploadModal) {
    adminUploadBtn.addEventListener('click', () => {
      uploadModal.classList.add('open');
    });
  }

  if (closeModalBtn && uploadModal) {
    closeModalBtn.addEventListener('click', () => {
      uploadModal.classList.remove('open');
    });
  }

  if (uploadModal) {
    uploadModal.addEventListener('click', (e) => {
      if (e.target === uploadModal) uploadModal.classList.remove('open');
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      API.clearAlert('modal-alert');

      const formData = new FormData(uploadForm);
      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      API.setButtonLoading(submitBtn, true, 'Uploading Question Paper...');

      try {
        await API.upload('/api/resources', formData);
        uploadModal.classList.remove('open');
        uploadForm.reset();
        API.showAlert('page-alert', 'Academic resource uploaded successfully to repository!', 'success');
        loadResources();
      } catch (err) {
        API.showAlert('modal-alert', err.message || 'Failed to upload resource.');
      } finally {
        API.setButtonLoading(submitBtn, false);
      }
    });
  }
}

function setupFilters() {
  const searchInput = document.getElementById('resource-search');
  const deptSelect = document.getElementById('resource-dept');
  const semSelect = document.getElementById('resource-sem');
  const resetBtn = document.getElementById('btn-reset-filters');

  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadResources, 300);
    });
  }

  if (deptSelect) deptSelect.addEventListener('change', loadResources);
  if (semSelect) semSelect.addEventListener('change', loadResources);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (deptSelect) deptSelect.value = '';
      if (semSelect) semSelect.value = '';
      loadResources();
    });
  }
}

async function loadResources() {
  const container = document.getElementById('resources-container');
  if (!container) return;

  const search = document.getElementById('resource-search')?.value.trim() || '';
  const dept = document.getElementById('resource-dept')?.value || '';
  const sem = document.getElementById('resource-sem')?.value || '';

  container.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
      <span class="spinner-sm"></span>
      <p style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.875rem;">Loading academic repository...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (dept) params.append('department', dept);
    if (sem) params.append('semester', sem);

    const res = await API.get(`/api/resources?${params.toString()}`);
    const resources = res.resources || [];

    if (resources.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1;">
          <div class="empty-state">
            <div class="empty-state-icon">📄</div>
            <h3 class="empty-state-title">No Academic Papers Found</h3>
            <p class="empty-state-text">
              No question papers found for the selected criteria. Please check your filter or search term.
            </p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = resources.map(r => {
      const ext = (r.original_filename || '').split('.').pop().toUpperCase() || 'PDF';
      return `
        <div class="resource-card">
          <div>
            <div class="resource-card-header">
              <div class="resource-pdf-icon">${ext}</div>
              <div>
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--college-slate);">${r.resource_id}</div>
                <h3 class="resource-title">${r.title}</h3>
              </div>
            </div>

            <div class="resource-tags">
              <span class="resource-tag">${r.department}</span>
              <span class="resource-tag">${r.semester}</span>
              <span class="resource-tag">${r.academic_year}</span>
            </div>

            <div class="resource-meta">
              <div><strong>Subject:</strong> ${r.subject}</div>
              <div><strong>Uploaded:</strong> ${API.formatDate(r.created_at)}</div>
            </div>
          </div>

          <div class="resource-actions">
            <a href="/api/resources/${r.id}/download" class="btn-download" download>
              <span>📥</span> Download ${ext}
            </a>
            ${currentUser && currentUser.role === 'admin' ? `
              <button type="button" class="btn btn-secondary-sm" onclick="editResourcePrompt(${r.id}, '${escapeAttr(r.title)}', '${r.department}', '${escapeAttr(r.subject)}', '${r.semester}', '${r.academic_year}')" title="Edit details">
                ✏️
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick="deleteResource(${r.id})" title="Delete resource">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1;">
        <div class="alert alert-error">Failed to load academic resources: ${err.message}</div>
      </div>
    `;
  }
}

function escapeAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.editResourcePrompt = async function(id, title, dept, subject, sem, year) {
  const newTitle = prompt('Edit Resource Title:', title);
  if (newTitle === null) return;

  const newSubject = prompt('Edit Subject:', subject);
  if (newSubject === null) return;

  try {
    await API.patch(`/api/resources/${id}`, {
      title: newTitle.trim(),
      department: dept,
      subject: newSubject.trim(),
      semester: sem,
      academic_year: year
    });
    API.showAlert('page-alert', 'Resource details updated successfully!', 'success');
    loadResources();
  } catch (err) {
    alert('Failed to update resource: ' + err.message);
  }
};

window.deleteResource = async function(id) {
  if (!confirm('Are you sure you want to remove this academic resource from the college repository?')) return;
  try {
    await API.delete(`/api/resources/${id}`);
    API.showAlert('page-alert', 'Resource removed from repository.', 'info');
    loadResources();
  } catch (err) {
    alert(err.message || 'Failed to delete resource.');
  }
};
