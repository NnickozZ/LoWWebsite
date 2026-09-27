import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb, assetsDir } = await import('../lib/db/open.mjs');
const { readZip } = await import('../lib/zip.mjs');
const { upgradeArchive, upgradeCanvasTexts } = await import('../lib/entries/shortUpgrade.mjs');
const { upgradeDocs } = await import('../lib/entries/docUpgrade.mjs');
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
    /*
     * §97: the live rooms' Yjs state is a BLOB, and `buildArchive` writes a
     * Buffer to JSON as `{ type: 'Buffer', data: [...] }`, which no INSERT can
     * bind — so a backup with one open room in it failed to restore at all.
     * The rooms are not the archive: each seeds itself again from its row on
     * the first open. So they are left empty, and a room of a restored text
     * can never carry a stale name or a version the rows no longer have.
     */
    if (table === 'live_docs') continue;

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

  /*
   * §97: a backup made before migration 0035 holds its running text with the
   * old links — the id, the name, the slug of whatever it named, handed to
   * every reader. The archive it lands in has 0035 behind it, so the same
   * conversion runs here on the restored rows: each link becomes a handle, the
   * plain texts beside them are written again, and the rooms of those texts
   * seed afresh. A backup made after 0035 has nothing left to convert, and the
   * step finds nothing (it is idempotent).
   */
  const knowsDocHandles = migrations.some((row) => row?.name === '0035_de_lopende_tekst');
  if (knownTables.has('mention_handles') && !knowsDocHandles) upgradeDocs(db);

  /*
   * §98: the same again for migration 0036 — a backup made before it holds
   * `[[Naam]]` / `@Naam` in a speld, a gebeurtenis, a los kaartje, the
   * omschrijving of a landkaart, tijdlijn or stamboom and an overzicht's
   * inleiding. It may well carry `mention_handles` (made between 0034 and
   * 0036), so the test is the migration list alone. The conversion also empties
   * `entry_mentions`, which the next start builds again with the chips in it.
   */
  const knowsCanvasHandles = migrations.some((row) => row?.name === '0036_elk_kort_vak');
  if (knownTables.has('mention_handles') && !knowsCanvasHandles) {
    upgradeCanvasTexts(db);
  }

  /*
   * Rebuild the search index rather than trusting a backed-up copy of it.
   * §97: with the words of a chip-bearing text and without the names behind
   * the chips — the index is one table for everybody (`indexShort`).
   */
  db.prepare('DELETE FROM entries_fts').run();
  const words = (text) => projectShort(text ?? '', () => null);
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
    reindex.run(entry.id, entry.name, words(entry.short_description), words(entry.body_text), tags.join(' '));
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
