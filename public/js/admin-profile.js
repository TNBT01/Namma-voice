/**
 * NAMMA VOICE - Admin Profile Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/admin-login.html';
    return;
  }

  loadAdminProfile();
  setupProfileForm();
});

async function loadAdminProfile() {
  try {
    const res = await API.get('/api/admin/profile');
    const p = res.profile;

    document.getElementById('profile-name-header').textContent = p.name;
    document.getElementById('profile-email').textContent = p.email;
    document.getElementById('profile-role').textContent = p.role.toUpperCase();
    document.getElementById('profile-joined').textContent = API.formatDate(p.created_at);

    document.getElementById('edit-admin-name').value = p.name;
    document.getElementById('edit-admin-dept').value = p.department;
  } catch (err) {
    API.showAlert('admin-profile-alert', 'Failed to load administrator profile: ' + err.message);
  }
}

function setupProfileForm() {
  const form = document.getElementById('edit-admin-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('admin-profile-alert');

    const name = document.getElementById('edit-admin-name').value.trim();
    const department = document.getElementById('edit-admin-dept').value.trim();

    if (!name || name.length < 2) {
      return API.showAlert('admin-profile-alert', 'Name must be at least 2 characters.');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Saving Profile...');

    try {
      await API.patch('/api/admin/profile', { name, department });
      API.showAlert('admin-profile-alert', 'Administrator profile updated successfully!', 'success');
      loadAdminProfile();
    } catch (err) {
      API.showAlert('admin-profile-alert', err.message || 'Failed to update admin profile.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}
