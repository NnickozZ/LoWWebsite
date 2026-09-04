import { readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb, assetsDir, backupsDir } = await import('../lib/db/open.mjs');
const { buildArchive, archiveName } = await import('../lib/archive.mjs');

const KEEP = 14;

const db = openDb();
const { zip, tables, assets } = buildArchive(db, assetsDir());

const target = join(backupsDir(), archiveName());
writeFileSync(target, zip);

// Keep the last 14 (§11).
const existing = readdirSync(backupsDir())
  .filter((f) => f.startsWith('zeeland-') && f.endsWith('.zip'))
  .sort();
for (const old of existing.slice(0, Math.max(0, existing.length - KEEP))) {
  unlinkSync(join(backupsDir(), old));
}

console.log(`Wrote ${target} — ${tables.length} tables, ${assets} assets.`);
