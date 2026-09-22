import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb, assetsDir } = await import('../lib/db/open.mjs');
const { readZip } = await import('../lib/zip.mjs');
const { upgradeArchive } = await import('../lib/entries/shortUpgrade.mjs');
const { projectShort } = await import('../lib/entries/shortTokens.mjs');

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

// §89: a table name comes out of a zip file's path and is put into SQL, so it
// has to be one this archive actually has — never whatever the zip says.
const knownTables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
);

const restore = db.transaction(() => {
  for (const [name, data] of zip) {
    if (!name.startsWith('json/')) continue;
    const table = name.slice(5, -5);
    if (!knownTables.has(table)) continue;
    const rows = JSON.parse(data.toString('utf8'));
    if (table === 'schema_migrations') continue;

    /*
     * §89: only the columns this archive still has. A backup made before a
     * migration dropped a column (0032 dropped users.password_enc — the
     * readable copy of every password) still restores: the old field is left
     * behind in the zip instead of failing the INSERT, or worse, coming back.
     */
    const existing = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));
    if (!existing.size) continue;

    db.prepare(`DELETE FROM "${table}"`).run();
    if (!rows.length) continue;

    const columns = Object.keys(rows[0]).filter((c) => existing.has(c));
    const insert = db.prepare(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
    );
    for (const row of rows) insert.run(row);
  }

  /*
   * §93: a backup made before migration 0033 has no `room_drawer` at all, and
   * the loop above only touches tables the zip carries — so the drawers of the
   * archive being replaced would survive, pointing at kamers that no longer
   * exist. Before 0033 nothing lay in a drawer (the migration invents no
   * ownership), so an old backup restores with every drawer empty.
   */
  if (knownTables.has('room_drawer') && !zip.has('json/room_drawer.json')) {
    db.prepare('DELETE FROM room_drawer').run();
  }

  /*
   * §95: a backup made before migration 0034 holds its short texts as the
   * letters `[[Naam]]` / `@Naam` and carries no `mention_handles` — while the
   * archive it lands in has the migration behind it and will never run it
   * again. So the handles of the archive being replaced go (they point into a
   * database that is no longer there), and the same conversion the migration
   * makes runs here, on the restored rows. A backup made after 0034 carries its
   * own handles and its texts already hold them; it is left exactly as it was.
   */
  let migrations = [];
  try {
    migrations = JSON.parse(zip.get('json/schema_migrations.json')?.toString('utf8') ?? '[]');
  } catch {
    migrations = [];
  }
  const knowsHandles = zip.has('json/mention_handles.json') || migrations.some((row) => row?.name === '0034_een_id');
  if (knownTables.has('mention_handles') && !knowsHandles) {
    db.prepare('DELETE FROM mention_handles').run();
    upgradeArchive(db);
  }

  // Rebuild the search index rather than trusting a backed-up copy of it.
  db.prepare('DELETE FROM entries_fts').run();
  const handleName = knownTables.has('mention_handles')
    ? db.prepare('SELECT e.name AS name FROM mention_handles h JOIN entries e ON e.id = h.entry_id WHERE h.handle = ?')
    : null;
  const nameOfHandle = (handle) => handleName?.get(handle)?.name ?? null;
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
    // §95: the names of a short text's chips, not its handles.
    reindex.run(entry.id, entry.name, projectShort(entry.short_description ?? '', nameOfHandle), entry.body_text, tags.join(' '));
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
