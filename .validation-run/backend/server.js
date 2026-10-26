/**
 * NAMMA VOICE - Server Entry Point
 * APS College of Arts and Science
 */

import dotenv from 'dotenv';
dotenv.config();

import { config } from './config/config.js';
import { createSchema } from './database/init-db.js';
import { seedDatabase } from './database/seed.js';
import { app } from './app.js';

async function startServer() {
  try {
    console.log('--------------------------------------------------');
    console.log(` Starting ${config.appName} Server...`);
    console.log(` College: ${config.collegeName}`);
    console.log('--------------------------------------------------');

    // 1. Initialize SQLite Database Schema & Tables
    await createSchema();

    // 2. Seed Default Accounts, Demo Complaints & Academic Resources
    await seedDatabase();

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
    console.error('Fatal Server Startup Error:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (process.argv[1].endsWith('server.js')) {
  startServer();
}

export { startServer };
export default startServer;
