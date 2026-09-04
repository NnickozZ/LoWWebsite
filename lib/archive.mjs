import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createZip } from './zip.mjs';

/**
 * §11's "Download everything": every table as JSON plus every asset, in one
 * zip. The same function backs the admin download and the nightly backup, so
 * the two can never drift into different formats.
 *
 * Plain JS because `scripts/backup.mjs` runs it outside the Next build.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} assetsPath
 * @returns {{ zip: Buffer, tables: string[], assets: number }}
 */
export function buildArchive(db, assetsPath) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entries_fts%'",
    )
    .all()
    .map((row) => row.name);

  const files = [];

  for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    files.push({
      name: `json/${table}.json`,
      data: Buffer.from(JSON.stringify(rows, null, 2), 'utf8'),
    });
  }

  let assets = 0;
  try {
    for (const filename of readdirSync(assetsPath)) {
      const path = join(assetsPath, filename);
      if (!statSync(path).isFile()) continue;
      files.push({ name: `assets/${filename}`, data: readFileSync(path) });
      assets++;
    }
  } catch {
    /* no assets yet */
  }

  files.push({
    name: 'MANIFEST.json',
    data: Buffer.from(
      JSON.stringify(
        { createdAt: new Date().toISOString(), tables, assets, format: 1 },
        null,
        2,
      ),
      'utf8',
    ),
  });

  return { zip: createZip(files), tables, assets };
}

/** `zeeland-2026-09-04T13-20-11.zip` — sorts chronologically as a filename. */
export function archiveName(date = new Date()) {
  return `zeeland-${date.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`;
}
