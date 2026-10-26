/**
 * NAMMA VOICE - SQLite Database Engine
 * Powered by SQL.js (WebAssembly SQLite)
 * Persistent SQLite storage in database/namma_voice.sqlite
 */

import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { config } from '../config/config.js';

let dbInstance = null;
let SQL = null;

/**
 * Persist the in-memory SQLite state to the physical .sqlite file on disk.
 */
export function saveDatabase() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(config.paths.database);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(config.paths.database, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

/**
 * Initialize SQLite database connection
 */
export async function initDatabase() {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  const dbPath = config.paths.database;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let fileBuffer = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = fs.readFileSync(dbPath);
  }

  dbInstance = new SQL.Database(fileBuffer);
  // Enable foreign key enforcement
  dbInstance.run('PRAGMA foreign_keys = ON;');

  return dbInstance;
}

/**
 * Execute a query that returns multiple rows as JavaScript objects.
 * Parameterized with safe query binding.
 */
export function query(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.');
  const stmt = dbInstance.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/**
 * Execute a query that returns a single row object, or null if not found.
 */
export function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

let inTransaction = false;

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 * Automatically saves the SQLite database file to disk (when not in a transaction).
 * Returns { changes, lastInsertRowid }
 */
export function run(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.');
  const stmt = dbInstance.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }

  // Get last insert row id and changes
  const lastIdRes = dbInstance.exec('SELECT last_insert_rowid() as id, changes() as changes;');
  let lastInsertRowid = 0;
  let changes = 0;
  if (lastIdRes && lastIdRes[0] && lastIdRes[0].values && lastIdRes[0].values[0]) {
    lastInsertRowid = lastIdRes[0].values[0][0];
    changes = lastIdRes[0].values[0][1];
  }

  // Persist to disk only when not inside a transaction batch
  if (!inTransaction) {
    saveDatabase();
  }

  return { lastInsertRowid, changes };
}

/**
 * Execute operations within an atomic SQLite transaction.
 */
export function transaction(callback) {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.');
  inTransaction = true;
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const result = callback();
    dbInstance.run('COMMIT;');
    inTransaction = false;
    saveDatabase();
    return result;
  } catch (err) {
    inTransaction = false;
    try {
      dbInstance.run('ROLLBACK;');
    } catch (rbErr) {
      // Transaction may have already been aborted by SQLite
    }
    throw err;
  }
}

export default {
  initDatabase,
  query,
  get,
  run,
  transaction,
  saveDatabase
};
