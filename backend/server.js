/**
 * NAMMA VOICE - Server Entry Point
 * APS College of Arts and Science
 */

import { config } from './config/config.js';
import { createSchema } from './database/init-db.js';
import { seedDatabase } from './database/seed.js';
import { initDatabase } from './database/database.js';
import { app } from './app.js';

const skipDatabaseBootstrap = process.argv.includes('--skip-db-bootstrap');

async function startServer() {
  try {
    console.log('--------------------------------------------------');
    console.log(` Starting ${config.appName} Server...`);
    console.log(` College: ${config.collegeName}`);
    console.log('--------------------------------------------------');

    if (skipDatabaseBootstrap) {
      // Use only for an existing database whose schema has already been verified.
      await initDatabase();
      console.log('Using the existing SQLite database without schema bootstrap or seeding.');
    } else {
      // 1. Initialize SQLite Database Schema & Tables
      await createSchema();

      // 2. Provision explicitly configured accounts and academic resources; complaints are never seeded.
      await seedDatabase();
    }

    // 3. Start Express HTTP Server
    const port = config.port;
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`✓ Server running at: http://localhost:${port}`);
      console.log('==================================================');
      console.log(' NAMMA VOICE Portal is Ready.');
      console.log(' Student Registration: http://localhost:' + port + '/student-register.html');
      console.log(' Administrator Setup:  npm run create-admin');
      console.log('==================================================');
    });

    return server;
  } catch (err) {
    console.error('Fatal server startup failure:', err.name || 'Error');
    process.exit(1);
  }
}

// Start if executed directly
if (process.argv[1].endsWith('server.js')) {
  startServer();
}

export { startServer };
export default startServer;
