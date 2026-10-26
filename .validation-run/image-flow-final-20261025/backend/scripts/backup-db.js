/**
 * NAMMA VOICE - SQLite Database Backup Utility
 * APS College of Arts and Science
 *
 * Creates timestamped snapshots of database/namma_voice.sqlite into backups/ directory.
 * Usage: npm run backup-db
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';

const rootDir = config.paths.root;

export function createDatabaseBackup() {
  const dbPath = config.paths.database;
  const backupDir = path.join(rootDir, 'backups');

  if (!fs.existsSync(dbPath)) {
    console.log('No database file found to back up at:', dbPath);
    return null;
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `namma_voice_backup_${timestamp}.sqlite`);

  fs.copyFileSync(dbPath, backupFile);
  const stats = fs.statSync(backupFile);

  console.log('====================================================');
  console.log(' DATABASE BACKUP COMPLETED');
  console.log(' Source:      ', dbPath);
  console.log(' Backup File: ', backupFile);
  console.log(' File Size:   ', `${(stats.size / 1024).toFixed(2)} KB`);
  console.log('====================================================');

  return backupFile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createDatabaseBackup();
}
