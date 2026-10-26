/**
 * NAMMA VOICE - Student Profile Client Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'student') {
    window.location.href = '/student-login.html';
    return;
  }

  loadProfile();
  setupProfileForm();
});

async function loadProfile() {
  try {
    const res = await API.get('/api/student/profile');
    const p = res.profile;

    document.getElementById('profile-id').textContent = p.student_id;
    document.getElementById('profile-name-header').textContent = p.name;
    document.getElementById('profile-department-badge').textContent = p.department;
    document.getElementById('profile-email').textContent = p.email;
    document.getElementById('profile-joined').textContent = API.formatDate(p.created_at);

    // Form fields
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-phone').value = p.phone || '';
    document.getElementById('edit-semester').value = p.semester;
  } catch (err) {
    API.showAlert('profile-alert', 'Failed to load profile details: ' + err.message);
  }
}

function setupProfileForm() {
  const form = document.getElementById('edit-profile-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    API.clearAlert('profile-alert');

    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const semester = document.getElementById('edit-semester').value;

    if (!name || name.length < 2) {
      return API.showAlert('profile-alert', 'Please enter your full name (at least 2 characters).');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    API.setButtonLoading(submitBtn, true, 'Saving Changes...');

    try {
      const res = await API.patch('/api/student/profile', { name, phone, semester });
      API.showAlert('profile-alert', 'Profile updated successfully!', 'success');
      loadProfile();
    } catch (err) {
      API.showAlert('profile-alert', err.message || 'Failed to update profile.');
    } finally {
      API.setButtonLoading(submitBtn, false);
    }
  });
}
