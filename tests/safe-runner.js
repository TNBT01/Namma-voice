import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validationRoot = path.resolve(projectRoot, '.validation-run');
const runId = `${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
const runDirectory = path.resolve(validationRoot, `auth-suite-${runId}`);
if (!runDirectory.startsWith(`${validationRoot}${path.sep}`)) throw new Error('Unsafe automated-test path.');
await fs.mkdir(runDirectory, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.APP_BASE_URL = 'http://localhost';
// Never inherit or load live Resend credentials into an automated run. Provider
// behavior is exercised only through the explicit mocked fetch in run-tests.js.
process.env.EMAIL_PROVIDER = 'resend';
process.env.EMAIL_VERIFICATION_ENABLED = 'false';
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
process.env.DATABASE_PATH = path.relative(projectRoot, path.join(runDirectory, 'namma_voice_test.sqlite')).replace(/\\/g, '/');
process.env.BACKUP_DIR = path.join(runDirectory, 'backups');
process.env.TEST_UPLOADS_DIR = runDirectory;
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
globalThis.__NAMMA_TEST_EMAIL_OUTBOX = [];

let testError = null;
try {
  const { setTestEmailTransport } = await import('../backend/services/email-service.js');
  setTestEmailTransport(message => globalThis.__NAMMA_TEST_EMAIL_OUTBOX.push(message));
  const { testRun } = await import('./run-tests.js');
  await testRun;
} catch (error) {
  testError = error;
  console.error('Test execution error:', error);
} finally {
  // All test-only database, upload, and backup files are constrained to this
  // uniquely named directory under .validation-run.
  await fs.rm(runDirectory, { recursive: true, force: true });
}

if (testError) process.exitCode = 1;
