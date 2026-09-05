import { drizzle } from 'drizzle-orm/better-sqlite3';
import { changeLogger } from '@/lib/live/changes';
import { assetsDir, backupsDir, dataDir, openDb } from './open.mjs';
import { seedBaseline } from './seed.mjs';
import * as schema from './schema';

export const DATA_DIR: string = dataDir();
export const ASSETS_DIR: string = assetsDir();
export const BACKUPS_DIR: string = backupsDir();

function create() {
  const sqlite = openDb();
  seedBaseline(sqlite);
  // §21: every statement passes the change logger, so no write is silent.
  return { sqlite, db: drizzle(sqlite, { schema, logger: changeLogger }) };
}

// Reuse one connection across hot reloads in dev; a second better-sqlite3
// handle per reload would leak file descriptors.
const globalForDb = globalThis as unknown as { __zcfDb?: ReturnType<typeof create> };
const instance = globalForDb.__zcfDb ?? create();
if (process.env.NODE_ENV !== 'production') globalForDb.__zcfDb = instance;

export const sqlite = instance.sqlite;
export const db = instance.db;
export { schema };
