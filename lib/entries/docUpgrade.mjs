import { newHandle } from './shortUpgrade.mjs';
import { projectShort } from './shortTokens.mjs';
import { docText, legacyLinkId, linkHandle, linkNode, mapLinks } from './docLinks.mjs';

/**
 * §97, ronde 58: de lopende tekst van het archief omzetten van `entryLink {id,
 * label, slug, icon, colour}` naar `entryLink {handle}`, op een kale
 * better-sqlite3-verbinding. Gedeeld door de migratie `0035_de_lopende_tekst`,
 * door `scripts/restore.mjs` (een backup van vóór 0035) en door de seeds
 * (`seed-demo`, `seed-wereld`), die hun documenten nog met ids schrijven.
 * Regel 4: daarom een `.mjs`.
 *
 * Er valt niets te raden: een oude link wist zijn id al. Wat het doet:
 *   1. elke `entryLink` met een id van een artikel dat bestaat, wordt een
 *      handvat in `mention_handles` (één per vermelding, zoals §95); één naar
 *      een artikel dat niet meer bestaat, valt weg — wat vernietigd is, is
 *      niets (§95). Een `entryLink` met een handvat houdt alleen dat handvat;
 *   2. in `entries.body`, `sections.body`, `cases.notes`, en in de kopieën in
 *      `entry_revisions`, `pending_edits` en `case_revisions` — en de platte
 *      tekst ernaast (`body_text`, `notes_text`, `bodyText`, `notesText`)
 *      wordt opnieuw geschreven, mét tokens en zonder namen;
 *   3. de opgeslagen kamerstaat van elke omgezette tekst gaat weg
 *      (`entry:*:body`, `section:*`, `case:*:notes`): de kamer zaait zich bij de
 *      eerste opening opnieuw uit de rij, zonder naam of id erin;
 *   4. de zoekindex wordt helemaal herschreven, **zonder** de namen achter de
 *      chips, van de lopende tekst en van de korte vakken (`indexShort`).
 *
 * Idempotent: een tweede ronde vindt geen id meer, verandert geen rij en schrijft
 * een index die er al zo uitzag.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {{ docs: number, links: number, dropped: number }}
 */
export function upgradeDocs(sqlite) {
  const hasTable = (name) =>
    Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  const counts = { docs: 0, links: 0, dropped: 0 };
  if (!hasTable('mention_handles') || !hasTable('entries')) return counts;

  const exists = new Set(sqlite.prepare('SELECT id FROM entries').all().map((row) => row.id));
  const insertHandle = sqlite.prepare('INSERT INTO mention_handles (handle, entry_id) VALUES (?, ?)');
  /** @param {string} entryId */
  const mint = (entryId) => {
    for (;;) {
      const handle = newHandle();
      try {
        insertHandle.run(handle, entryId);
        return handle;
      } catch {
        /* a collision in 71 bits: draw again */
      }
    }
  };

  /** @param {unknown} doc @returns {{ doc: unknown, changed: boolean }} */
  const convert = (doc) => {
    if (!doc || typeof doc !== 'object') return { doc, changed: false };
    const result = mapLinks(doc, (node) => {
      const handle = linkHandle(node);
      if (handle) {
        const keys = Object.keys(node.attrs ?? {});
        return keys.length === 1 && node.marks === undefined && node.content === undefined ? node : linkNode(handle);
      }
      const id = legacyLinkId(node);
      if (id && exists.has(id)) {
        counts.links++;
        return linkNode(mint(id));
      }
      counts.dropped++;
      return null;
    });
    if (result.changed) counts.docs++;
    return result;
  };

  /** @param {unknown} raw */
  const parse = (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  /** @type {string[]} */
  const rooms = [];

  // entries.body
  {
    const write = sqlite.prepare('UPDATE entries SET body = ?, body_text = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, body FROM entries').all()) {
      const { doc, changed } = convert(parse(row.body));
      if (!changed) continue;
      write.run(JSON.stringify(doc), docText(doc), row.id);
      rooms.push(`entry:${row.id}:body`);
    }
  }

  // sections.body
  if (hasTable('sections')) {
    const write = sqlite.prepare('UPDATE sections SET body = ?, body_text = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, body FROM sections').all()) {
      const { doc, changed } = convert(parse(row.body));
      if (!changed) continue;
      write.run(JSON.stringify(doc), docText(doc), row.id);
      rooms.push(`section:${row.id}`);
    }
  }

  // cases.notes
  if (hasTable('cases')) {
    const write = sqlite.prepare('UPDATE cases SET notes = ?, notes_text = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, notes FROM cases').all()) {
      const { doc, changed } = convert(parse(row.notes));
      if (!changed) continue;
      write.run(JSON.stringify(doc), docText(doc), row.id);
      rooms.push(`case:${row.id}:notes`);
    }
  }

  // The copies: a version put back, or a voorstel taken, must not bring a name back.
  /** @type {[string, string, string, string | null][]} table, column, document key, text key */
  const copies = [
    ['entry_revisions', 'snapshot', 'body', 'bodyText'],
    ['pending_edits', 'proposed_snapshot', 'body', null],
    ['case_revisions', 'snapshot', 'notes', 'notesText'],
  ];
  for (const [table, column, key, textKey] of copies) {
    if (!hasTable(table)) continue;
    const write = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const row of sqlite.prepare(`SELECT id, ${column} AS snap FROM ${table}`).all()) {
      const snap = parse(row.snap);
      if (!snap || typeof snap !== 'object' || !(key in snap)) continue;
      const { doc, changed } = convert(snap[key]);
      if (!changed) continue;
      const next = { ...snap, [key]: doc };
      if (textKey) next[textKey] = docText(doc);
      write.run(JSON.stringify(next), row.id);
    }
  }

  // The rooms of what changed seed again from the rows.
  if (rooms.length && hasTable('live_docs')) {
    const forget = sqlite.prepare('DELETE FROM live_docs WHERE room = ?');
    for (const room of rooms) forget.run(room);
  }

  // The search index, whole, with the words and without the names behind the chips.
  if (hasTable('entries_fts')) {
    /** @param {unknown} text */
    const words = (text) => projectShort(typeof text === 'string' ? text : '', () => null);
    sqlite.prepare('DELETE FROM entries_fts').run();
    const insert = sqlite.prepare(
      'INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)',
    );
    for (const row of sqlite
      .prepare('SELECT id, name, short_description, body_text, tags FROM entries WHERE deleted_at IS NULL')
      .all()) {
      const tags = parse(row.tags);
      insert.run(row.id, row.name, words(row.short_description), words(row.body_text), Array.isArray(tags) ? tags.join(' ') : '');
    }
  }

  return counts;
}
