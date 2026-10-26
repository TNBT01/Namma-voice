/**
 * NAMMA VOICE - Home Page Script
 */

document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
});

function renderCategories() {
  const container = document.getElementById('categories-grid');
  if (!container || !window.APP_CONFIG) return;

  const icons = {
    'Classroom': '🏫',
    'Laboratory': '🔬',
    'Library': '📚',
    'Hostel': '🏢',
    'Canteen': '☕',
    'Infrastructure': '🛠️',
    'Washroom': '🚰',
    'Sports': '⚽',
    'Electrical': '⚡',
    'Other': '📋'
  };

  const categories = window.APP_CONFIG.categories;
  container.innerHTML = categories.map(cat => `
    <div class="category-card">
      <div class="category-icon-box">${icons[cat] || '📋'}</div>
      <div class="category-name">${cat}</div>
    </div>
  `).join('');
}
