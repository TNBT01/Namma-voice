/**
 * NAMMA VOICE - SQLite Database Summary
 * Displays record counts without printing student, administrator, or complaint details.
 * Usage: node backend/database/view-db.js or npm run db:view
 */

import { initDatabase, get } from './database.js';

async function viewDatabase() {
  await initDatabase();
  const tables = ['students', 'admins', 'complaints', 'complaint_history', 'resources'];
  const summary = tables.map(table => ({
    table,
    records: get(`SELECT COUNT(*) AS count FROM ${table}`).count
  }));

  console.log('\nNAMMA VOICE — database record counts');
  console.table(summary);
}

viewDatabase().catch(err => {
  console.error('Database summary failed:', err.name || 'Error');
  process.exit(1);
});
