/**
 * NAMMA VOICE - Secure Administrator Creation CLI Tool
 * APS College of Arts and Science
 *
 * Usage (CLI arguments):
 *   node backend/scripts/create-admin.js --email=admin@aps.edu.in --password=AdminSecure@2026 --name="Dr. Ramesh Babu" --department="Administration"
 *
 * Usage (Interactive prompt):
 *   npm run create-admin
 */

import readline from 'readline';
import bcrypt from 'bcryptjs';
import { initDatabase, get, run } from '../database/database.js';
import { createSchema } from '../database/init-db.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      const val = parts.slice(1).join('=');
      args[key] = val || true;
    }
  }
  return args;
}

function ask(rl, prompt, isPassword = false) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function createAdminAccount({ name, email, password, department = 'Administration' }) {
  await createSchema();

  if (!email || !email.includes('@')) {
    throw new Error('A valid email address is required.');
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long for security compliance.');
  }

  const existing = get('SELECT id, email FROM admins WHERE email = ?', [email]);
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  if (existing) {
    run(
      `UPDATE admins SET name = ?, password_hash = ?, department = ?, is_active = 1, updated_at = ? WHERE id = ?`,
      [name || 'Administrator', passwordHash, department, now, existing.id]
    );
    console.log(`✓ Existing administrator account password updated: ${email}`);
    return { id: existing.id, email, updated: true };
  } else {
    const res = run(
      `INSERT INTO admins (name, email, password_hash, department, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`,
      [name || 'Administrator', email, passwordHash, department, now, now]
    );
    console.log(`✓ New administrator account created successfully: ${email}`);
    return { id: res.lastInsertRowid, email, created: true };
  }
}

async function main() {
  console.log('====================================================');
  console.log(' NAMMA VOICE - ADMINISTRATOR ACCOUNT SETUP');
  console.log(' APS College of Arts and Science');
  console.log('====================================================\n');

  const cliArgs = parseArgs();

  let name = cliArgs.name;
  let email = cliArgs.email;
  let password = cliArgs.password;
  let department = cliArgs.department || 'Administration';

  if (!email || !password) {
    // Run interactively
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      if (!name) name = await ask(rl, 'Enter Administrator Full Name [Administrator]: ') || 'Administrator';
      if (!email) email = await ask(rl, 'Enter Administrator Email Address (e.g. admin@aps.edu.in): ');
      if (!password) password = await ask(rl, 'Enter Secure Administrator Password (min 8 chars): ');
      if (!department) department = await ask(rl, 'Enter Department [Administration]: ') || 'Administration';
    } finally {
      rl.close();
    }
  }

  try {
    await createAdminAccount({ name, email, password, department });
    console.log('\nSetup completed successfully! Administrator can now sign in at /admin-login.html\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Error creating administrator account:', err.message);
    process.exit(1);
  }
}

// // Only execute CLI runner if executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main();
// }
import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Admin setup failed:', err.message);
    process.exitCode = 1;
  });
}