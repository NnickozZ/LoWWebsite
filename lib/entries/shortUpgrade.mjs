import { randomBytes } from 'node:crypto';
import { projectShort, upgradeLegacy } from './shortTokens.mjs';

/**
 * §95, ronde 56: het archief omzetten van `[[Naam]]` naar `⟦h⟧`, op een kale
 * better-sqlite3-verbinding. Gedeeld door de migratie `0034_een_id` en door
 * `scripts/restore.mjs` (een backup van vóór 0034 komt terug in een archief dat
 * de migratie al achter zich heeft). Regel 4: daarom een `.mjs`.
 *
 * Wat het doet, en in deze volgorde:
 *   1. de namenindex zoals de lezer hem tot nu toe bouwde (`entryNameIndex`):
 *      niet uit de prullenbak, en de oudste van twee gelijke namen wint;
 *   2. elke `[[Naam]]` en `@Naam` die daarop iets vindt, wordt een token met een
 *      eigen handvat, in `entries.short_description`, in de Tekst- en Lange
 *      tekst-waarden van `entries.fields`, in `cases.summary`, en in de kopieën
 *      daarvan in `entry_revisions`, `case_revisions` en `pending_edits` — zodat
 *      een oude versie terugzetten geen `[[Naam]]` terugbrengt;
 *   3. de opgeslagen kamerstaat van `entry:*:fields` en `case:*:fields` gaat
 *      weg: de kamer zaait zich bij de eerste opening opnieuw uit de rij;
 *   4. de zoekindex van elk omgezet artikel wordt herschreven, met de namen.
 *
 * Idempotent: een token bevat geen `[[` en geen `@`, dus een tweede ronde vindt
 * niets. Wat niets vindt, blijft letter voor letter staan.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Een nieuw handvat: twaalf tekens, 71 bits, niets dat naar iets wijst. */
export function newHandle() {
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** @param {unknown} raw */
function parseJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {{ texts: number, handles: number }}
 */
export function upgradeArchive(sqlite) {
  const hasTable = (name) =>
    Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (!hasTable('mention_handles') || !hasTable('entries')) return { texts: 0, handles: 0 };

  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const row of sqlite
    .prepare('SELECT id, name FROM entries WHERE deleted_at IS NULL ORDER BY created_at, id')
    .all()) {
    const key = String(row.name ?? '').trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, row.id);
  }
  if (!byName.size) return { texts: 0, handles: 0 };

  const insertHandle = sqlite.prepare('INSERT INTO mention_handles (handle, entry_id) VALUES (?, ?)');
  let handles = 0;
  /** @param {string} entryId */
  const mint = (entryId) => {
    for (;;) {
      const handle = newHandle();
      try {
        insertHandle.run(handle, entryId);
        handles++;
        return handle;
      } catch {
        /* a collision in 71 bits: draw again */
      }
    }
  };
  let texts = 0;
  /** @param {unknown} value */
  const upgrade = (value) => {
    if (typeof value !== 'string') return { text: value, changed: false };
    const result = upgradeLegacy(value, byName, mint);
    if (result.changed) texts++;
    return result;
  };

  /** type id → the keys of its Tekst and Lange tekst fields */
  /** @type {Map<string, Set<string>>} */
  const textKeys = new Map();
  for (const row of sqlite.prepare('SELECT id, fields FROM entry_types').all()) {
    const defs = parseJson(row.fields);
    const keys = new Set();
    if (Array.isArray(defs)) {
      for (const def of defs) if (def && (def.kind === 'text' || def.kind === 'longtext') && typeof def.key === 'string') keys.add(def.key);
    }
    textKeys.set(row.id, keys);
  }
  /** @type {Map<string, string>} */
  const typeOf = new Map(sqlite.prepare('SELECT id, type_id FROM entries').all().map((row) => [row.id, row.type_id]));

  /** @param {unknown} fields @param {string | undefined} typeId */
  const upgradeFields = (fields, typeId) => {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { fields, changed: false };
    const keys = typeId ? textKeys.get(typeId) : undefined;
    if (!keys || !keys.size) return { fields, changed: false };
    let changed = false;
    /** @type {Record<string, unknown>} */
    const out = { ...fields };
    for (const key of keys) {
      const result = upgrade(out[key]);
      if (result.changed) {
        out[key] = result.text;
        changed = true;
      }
    }
    return { fields: out, changed };
  };

  /** @type {Set<string>} */
  const touched = new Set();

  // 2a. entries
  const updateEntry = sqlite.prepare('UPDATE entries SET short_description = ?, fields = ? WHERE id = ?');
  for (const row of sqlite.prepare('SELECT id, type_id, short_description, fields FROM entries').all()) {
    const short = upgrade(row.short_description);
    const fields = upgradeFields(parseJson(row.fields), row.type_id);
    if (!short.changed && !fields.changed) continue;
    updateEntry.run(short.text, fields.changed ? JSON.stringify(fields.fields) : row.fields, row.id);
    touched.add(row.id);
  }

  // 2b. cases
  if (hasTable('cases')) {
    const updateCase = sqlite.prepare('UPDATE cases SET summary = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, summary FROM cases').all()) {
      const summary = upgrade(row.summary);
      if (summary.changed) updateCase.run(summary.text, row.id);
    }
  }

  // 2c. the copies: a version put back must not bring `[[Naam]]` back.
  const snapshots = [
    ['entry_revisions', 'snapshot', 'entry_id'],
    ['pending_edits', 'proposed_snapshot', 'entry_id'],
  ];
  for (const [table, column, owner] of snapshots) {
    if (!hasTable(table)) continue;
    const write = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const row of sqlite.prepare(`SELECT id, ${owner} AS owner, ${column} AS snap FROM ${table}`).all()) {
      const snap = parseJson(row.snap);
      if (!snap || typeof snap !== 'object') continue;
      let changed = false;
      const next = { ...snap };
      const short = upgrade(next.shortDescription);
      if (short.changed) {
        next.shortDescription = short.text;
        changed = true;
      }
      const fields = upgradeFields(next.fields, typeOf.get(row.owner));
      if (fields.changed) {
        next.fields = fields.fields;
        changed = true;
      }
      if (changed) write.run(JSON.stringify(next), row.id);
    }
  }
  if (hasTable('case_revisions')) {
    const write = sqlite.prepare('UPDATE case_revisions SET snapshot = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, snapshot FROM case_revisions').all()) {
      const snap = parseJson(row.snapshot);
      if (!snap || typeof snap !== 'object') continue;
      const summary = upgrade(snap.summary);
      if (summary.changed) write.run(JSON.stringify({ ...snap, summary: summary.text }), row.id);
    }
  }

  // 3. the rooms seed again from the rows.
  if (hasTable('live_docs')) {
    sqlite.prepare("DELETE FROM live_docs WHERE room LIKE 'entry:%:fields' OR room LIKE 'case:%:fields'").run();
  }

  // 4. the search index, with the names as they are now.
  if (touched.size && hasTable('entries_fts')) {
    const nameOfHandle = sqlite.prepare(
      'SELECT e.name AS name FROM mention_handles h JOIN entries e ON e.id = h.entry_id WHERE h.handle = ?',
    );
    /** @param {string} handle */
    const nameOf = (handle) => nameOfHandle.get(handle)?.name ?? null;
    const del = sqlite.prepare('DELETE FROM entries_fts WHERE entry_id = ?');
    const ins = sqlite.prepare(
      'INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)',
    );
    const read = sqlite.prepare('SELECT id, name, short_description, body_text, tags, deleted_at FROM entries WHERE id = ?');
    for (const id of touched) {
      const row = read.get(id);
      del.run(id);
      if (!row || row.deleted_at) continue;
      const tags = parseJson(row.tags);
      ins.run(row.id, row.name, projectShort(row.short_description, nameOf), row.body_text ?? '', Array.isArray(tags) ? tags.join(' ') : '');
    }
  }

  return { texts, handles };
}

/* ------------------------------------------------ §98: every short box */

/**
 * §98, ronde 59: de naamindex zoals de lezer hem tot nu toe bouwde — niet uit
 * de prullenbak, de oudste van twee gelijke namen wint. Dezelfde regel als
 * stap 1 van `upgradeArchive`, als eigen export zodat een volgende omzetting
 * hem niet opnieuw hoeft te schrijven.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {Map<string, string>}
 */
export function legacyNameIndex(sqlite) {
  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const row of sqlite
    .prepare('SELECT id, name FROM entries WHERE deleted_at IS NULL ORDER BY created_at, id')
    .all()) {
    const key = String(row.name ?? '').trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, row.id);
  }
  return byName;
}

/**
 * Een functie die per vermelding een nieuw handvat in `mention_handles` zet.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {{ mint: (entryId: string) => string, count: () => number }}
 */
export function handleMinter(sqlite) {
  const insert = sqlite.prepare('INSERT INTO mention_handles (handle, entry_id) VALUES (?, ?)');
  let made = 0;
  return {
    mint(entryId) {
      for (;;) {
        const handle = newHandle();
        try {
          insert.run(handle, entryId);
          made++;
          return handle;
        } catch {
          /* a collision in 71 bits: draw again */
        }
      }
    },
    count: () => made,
  };
}

/**
 * §98, ronde 59 (migratie `0036_elk_kort_vak`): de korte vakken die ronde 56
 * liet liggen, op dezelfde manier omgezet — met hetzelfde leesalgoritme, dus
 * geen chip wijst na de uitrol naar een ander artikel dan ervoor:
 *
 *   - de tekst van een speld (`map_pins.text`) en van een gebeurtenis
 *     (`timeline_events.text`);
 *   - de regel of twee op een los kaartje van een stamboom
 *     (`family_trees.state` → `loose[].text`);
 *   - de omschrijving van een landkaart, een tijdlijn en een stamboom
 *     (`maps.description`, `timelines.description`,
 *     `family_trees.description`);
 *   - de inleiding van een overzicht (`overzichten.lead`);
 *   - wat er op een kaartje van een prikbord staat (`boards.state` →
 *     `cards[].text`, en de kopieën in `board_revisions`).
 *
 * Daarna: de opgeslagen kamerstaat van `map:*:fields`, `pin:*:fields` en
 * `event:*:fields` gaat weg (de kamers zaaien opnieuw uit de rij), en
 * `entry_mentions` wordt geleegd — die tabel is afgeleid, en de opstart
 * (`ensureMentionsBackfilled`) bouwt hem opnieuw op met de chips erbij, ook die
 * van de korte vakken van ronde 56, die tot nu toe nooit meetelden. Geen van
 * deze kolommen staat in een zoekindex (`entries_fts` kent alleen artikelen),
 * dus daar valt niets te herschrijven.
 *
 * Idempotent, om dezelfde reden als `upgradeArchive`.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {{ texts: number, handles: number }}
 */
export function upgradeCanvasTexts(sqlite) {
  const hasTable = (name) =>
    Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (!hasTable('mention_handles') || !hasTable('entries')) return { texts: 0, handles: 0 };
  const byName = legacyNameIndex(sqlite);
  const minter = handleMinter(sqlite);
  let texts = 0;
  /** @param {unknown} value */
  const upgrade = (value) => {
    if (typeof value !== 'string' || !byName.size) return { text: value, changed: false };
    const result = upgradeLegacy(value, byName, minter.mint);
    if (result.changed) texts++;
    return result;
  };

  /** @type {[string, string][]} */
  const columns = [
    ['map_pins', 'text'],
    ['timeline_events', 'text'],
    ['maps', 'description'],
    ['timelines', 'description'],
    ['family_trees', 'description'],
    ['overzichten', 'lead'],
  ];
  for (const [table, column] of columns) {
    if (!hasTable(table)) continue;
    const write = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const row of sqlite.prepare(`SELECT id, ${column} AS value FROM ${table}`).all()) {
      const result = upgrade(row.value);
      if (result.changed) write.run(result.text, row.id);
    }
  }

  if (hasTable('family_trees')) {
    const write = sqlite.prepare('UPDATE family_trees SET state = ? WHERE id = ?');
    for (const row of sqlite.prepare('SELECT id, state FROM family_trees').all()) {
      const state = parseJson(row.state);
      if (!state || typeof state !== 'object' || !Array.isArray(state.loose)) continue;
      let changed = false;
      const loose = state.loose.map((card) => {
        if (!card || typeof card !== 'object') return card;
        const result = upgrade(card.text);
        if (!result.changed) return card;
        changed = true;
        return { ...card, text: result.text };
      });
      if (changed) write.run(JSON.stringify({ ...state, loose }), row.id);
    }
  }

  // A kaartje on a prikbord: `boards.state` → `cards[].text`, and the same in
  // every revision of a wall, so putting an old version back brings no
  // `[[Naam]]` back.
  /** @param {unknown} raw */
  const upgradeCards = (raw) => {
    const state = parseJson(raw);
    if (!state || typeof state !== 'object' || !Array.isArray(state.cards)) return null;
    let changed = false;
    const cards = state.cards.map((card) => {
      if (!card || typeof card !== 'object') return card;
      const result = upgrade(card.text);
      if (!result.changed) return card;
      changed = true;
      return { ...card, text: result.text };
    });
    return changed ? JSON.stringify({ ...state, cards }) : null;
  };
  for (const [table, column] of [
    ['boards', 'state'],
    ['board_revisions', 'snapshot'],
  ]) {
    if (!hasTable(table)) continue;
    const write = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const row of sqlite.prepare(`SELECT id, ${column} AS value FROM ${table}`).all()) {
      const next = upgradeCards(row.value);
      if (next) write.run(next, row.id);
    }
  }

  if (hasTable('live_docs')) {
    sqlite
      .prepare("DELETE FROM live_docs WHERE room LIKE 'map:%:fields' OR room LIKE 'pin:%:fields' OR room LIKE 'event:%:fields'")
      .run();
  }
  if (hasTable('entry_mentions')) sqlite.prepare('DELETE FROM entry_mentions').run();

  return { texts, handles: minter.count() };
}
