import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb, assetsDir } = await import('../lib/db/open.mjs');
const { readZip } = await import('../lib/zip.mjs');

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: npm run restore -- ./data/backups/zeeland-….zip');
  process.exit(1);
}

const zip = readZip(readFileSync(file));
const manifest = JSON.parse(zip.get('MANIFEST.json')?.toString('utf8') ?? '{}');

const rl = createInterface({ input: stdin, output: stdout });
console.log(`\nBackup from ${manifest.createdAt ?? 'unknown date'}`);
console.log(`  ${manifest.tables?.length ?? 0} tables, ${manifest.assets ?? 0} assets`);
console.log('\nThis REPLACES the current database and assets.');
const answer = (await rl.question('Type "restore" to go ahead: ')).trim();
rl.close();
if (answer !== 'restore') {
  console.log('Cancelled. Nothing was changed.');
  process.exit(0);
}

const db = openDb();

const restore = db.transaction(() => {
  for (const [name, data] of zip) {
    if (!name.startsWith('json/')) continue;
    const table = name.slice(5, -5);
    const rows = JSON.parse(data.toString('utf8'));
    if (table === 'schema_migrations') continue;

    db.prepare(`DELETE FROM "${table}"`).run();
    if (!rows.length) continue;

    const columns = Object.keys(rows[0]);
    const insert = db.prepare(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
    );
    for (const row of rows) insert.run(row);
  }

  // Rebuild the search index rather than trusting a backed-up copy of it.
  db.prepare('DELETE FROM entries_fts').run();
  const reindex = db.prepare(
    'INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)',
  );
  for (const entry of db
    .prepare('SELECT id, name, short_description, body_text, tags FROM entries WHERE deleted_at IS NULL')
    .all()) {
    let tags = [];
    try {
      tags = JSON.parse(entry.tags ?? '[]');
    } catch {
      tags = [];
    }
    reindex.run(entry.id, entry.name, entry.short_description, entry.body_text, tags.join(' '));
  }
});

restore();

let assets = 0;
for (const [name, data] of zip) {
  if (!name.startsWith('assets/')) continue;
  writeFileSync(join(assetsDir(), name.slice(7)), data);
  assets++;
}

console.log(`\nRestored. ${assets} assets written. Everyone will need to sign in again.`);
