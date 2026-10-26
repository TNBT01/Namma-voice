/**
 * NAMMA VOICE - Complaint Submission Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await API.getAuthUser();
  if (!user || user.role !== 'student') {
    window.location.href = '/student-login.html?redirect=/submit-complaint.html';
    return;
  }

  // Populate category options from config
  const catSelect = document.getElementById('complaint-category');
  if (catSelect && window.APP_CONFIG) {
    catSelect.innerHTML = `
      <option value="" disabled selected>Select facility or problem area</option>
      ${window.APP_CONFIG.categories.map(c => `<option value="${API.escapeHtml(c)}">${API.escapeHtml(c)}</option>`).join('')}
    `;
  }

  // Image preview
  const fileInput = document.getElementById('complaint-attachment');
  const previewContainer = document.getElementById('image-preview-wrap');
  const previewImg = document.getElementById('image-preview');

  if (fileInput && previewContainer && previewImg) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        previewContainer.style.display = 'none';
      }
    });
  }

  const form = document.getElementById('submit-complaint-form');
  if (form) {
    let isSubmitting = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      API.clearAlert('submit-alert');

      const title = document.getElementById('complaint-title').value.trim();
      const category = document.getElementById('complaint-category').value;
      const location = document.getElementById('complaint-location').value.trim();
      const description = document.getElementById('complaint-description').value.trim();

      if (!title || title.length < 3) {
        return API.showAlert('submit-alert', 'Please enter a clear complaint title (at least 3 characters).');
      }
      if (!category) {
        return API.showAlert('submit-alert', 'Please select a complaint category.');
      }
      if (!location) {
        return API.showAlert('submit-alert', 'Please specify the exact room, lab, or campus location.');
      }
      if (!description || description.length < 10) {
        return API.showAlert('submit-alert', 'Please provide a detailed description (minimum 10 characters).');
      }

      const formData = new FormData(form);
      const submitBtn = form.querySelector('button[type="submit"]');
      isSubmitting = true;
      API.setButtonLoading(submitBtn, true, 'Registering Complaint...');

      try {
        const res = await API.upload('/api/complaints', formData);
        const complaint = res.complaint;

        // Show Success Confirmation View
        document.getElementById('form-card').style.display = 'none';
        const successCard = document.getElementById('success-card');
        successCard.style.display = 'block';

        document.getElementById('success-complaint-id').textContent = complaint.complaint_id;
        document.getElementById('btn-view-submitted').href = `/student-complaint-details.html?id=${encodeURIComponent(complaint.complaint_id)}`;
      } catch (err) {
        API.showAlert('submit-alert', err.message || 'Failed to submit complaint. Please check fields.');
      } finally {
        isSubmitting = false;
        API.setButtonLoading(submitBtn, false);
      }
    });
  }
});
