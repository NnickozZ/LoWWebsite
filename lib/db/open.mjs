import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MIGRATIONS } from './migrations.mjs';

/** Absolute path of the data directory (SQLite file, assets, backups). */
export function dataDir() {
  return resolve(process.env.DATA_DIR || './data');
}

export function assetsDir() {
  return join(dataDir(), 'assets');
}

export function backupsDir() {
  return join(dataDir(), 'backups');
}

function ensureDirs() {
  for (const dir of [dataDir(), assetsDir(), backupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function applyMigrations(sqlite) {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))',
  );
  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((r) => r.name),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(migration.sql);
      sqlite.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw new Error(`Migration ${migration.name} failed: ${err.message}`);
    }
  }
}

/**
 * Opens (creating if needed) the SQLite database, applies migrations and seeds
 * the rows the app cannot run without. Safe to call repeatedly.
 */
export function openDb() {
  ensureDirs();
  const sqlite = new Database(join(dataDir(), 'app.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  applyMigrations(sqlite);
  return sqlite;
}
