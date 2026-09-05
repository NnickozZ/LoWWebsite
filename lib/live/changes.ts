import type { Logger } from 'drizzle-orm/logger';

/**
 * §21: every write tells the site.
 *
 * The one rule a universal live layer has to keep is that *no* write is
 * silent — a new dossier, a renamed soort, a pin moved, a word changed in
 * Beheer, all of it has to reach the tabs that show it, whoever wrote the
 * code and whenever. Asking every service function to remember a `touch()`
 * would hold for a week. So the hook is one level down: every statement the
 * ORM runs passes through `logQuery`, and any INSERT, UPDATE or DELETE is
 * read for its table and, where the SQL names them, its row ids. Those become
 * change keys (`entry:{id}`, `entries`, …) and go out to whoever watches them.
 *
 * Coalesced on a zero timer: a save is usually five statements (the row, a
 * revision, the index, the feed, the parent's `updated_at`), and the tabs
 * should hear one `changed`, after the last of them. SQLite is synchronous, so
 * "after" is exactly when the timer runs — the whole transaction is done.
 *
 * `touch()` is still there for a write the parser cannot see through (raw SQL,
 * a file on disk); it is the exception, not the way.
 */

type Deliver = (keys: string[]) => void;

/**
 * table → which keys move when a row in it does. `row` names the key made from
 * the row's own id; `refs` name keys made from foreign columns; `lists` are
 * the collection keys that always move.
 */
const TABLES: Record<string, { row?: string; refs?: Record<string, string>; lists: string[] }> = {
  entries: { row: 'entry', lists: ['entries', 'feed'] },
  entry_types: { lists: ['types', 'entries'] },
  entry_reveals: { refs: { entry_id: 'entry' }, lists: ['entries'] },
  entry_sections: { refs: { entry_id: 'entry' }, lists: [] },
  entry_section_reveals: { lists: ['entries'] },
  entry_revisions: { refs: { entry_id: 'entry' }, lists: [] },
  entry_links: { refs: { from_entry_id: 'entry', to_entry_id: 'entry' }, lists: [] },
  cases: { row: 'case', lists: ['cases', 'feed'] },
  case_members: { refs: { case_id: 'case' }, lists: ['cases'] },
  case_entries: { refs: { case_id: 'case', entry_id: 'entry' }, lists: ['cases'] },
  boards: { row: 'board', lists: ['boards'] },
  pending_edits: { refs: { entry_id: 'entry' }, lists: ['admin'] },
  audit_log: { lists: ['admin'] },
  activity: { refs: { case_id: 'case' }, lists: ['feed'] },
  access_grants: { lists: ['entries', 'cases', 'boards'] },
  user_characters: { refs: { entry_id: 'entry' }, lists: ['characters', 'users'] },
  maps: { row: 'map', lists: ['maps'] },
  map_pins: { row: 'pin', refs: { map_id: 'map', entry_id: 'entry' }, lists: ['maps'] },
  users: { lists: ['users'] },
  site_settings: { lists: ['site', 'words', 'types'] },
};

const VERB = /^\s*(insert\s+into|update|delete\s+from)\s+"?([A-Za-z_]+)"?/i;

/** `"table"."col" = ?` or `"col" = ?` or `… in (?, ?)` — with the index of each `?` in the statement. */
function boundColumns(sql: string): { column: string; positions: number[] }[] {
  const out: { column: string; positions: number[] }[] = [];
  const pattern = /(?:"[A-Za-z_]+"\.)?"([A-Za-z_]+)"\s*(=\s*\?|in\s*\(([\s?,]+)\))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) {
    const column = match[1];
    const start = match.index + match[0].indexOf(match[2]);
    const positions: number[] = [];
    for (let i = start; i < match.index + match[0].length; i++) if (sql[i] === '?') positions.push(i);
    out.push({ column, positions });
  }
  return out;
}

/** The ordinal (0-based) of the `?` at `position` among all `?` in the statement. */
function ordinalOf(sql: string, position: number): number {
  let n = 0;
  for (let i = 0; i < position; i++) if (sql[i] === '?') n++;
  return n;
}

function insertedValues(sql: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const columnsMatch = /^\s*insert\s+into\s+"?[A-Za-z_]+"?\s*\(([^)]*)\)\s*values\s*/i.exec(sql);
  if (!columnsMatch) return out;
  const columns = columnsMatch[1].split(',').map((c) => c.trim().replace(/"/g, ''));
  let cursor = columnsMatch[0].length;
  let ordinal = 0;
  // Each row is a parenthesised list; a `?` consumes a parameter, anything
  // else (`default`, `null`, a literal) does not.
  while (cursor < sql.length) {
    const open = sql.indexOf('(', cursor);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (; end < sql.length; end++) {
      if (sql[end] === '(') depth++;
      else if (sql[end] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const items = sql.slice(open + 1, end).split(',');
    items.forEach((item, i) => {
      if (item.trim() !== '?') return;
      const column = columns[i];
      if (column) {
        const list = out.get(column) ?? [];
        list.push(ordinal);
        out.set(column, list);
      }
      ordinal++;
    });
    cursor = end + 1;
    if (!/^\s*,/.test(sql.slice(cursor))) break;
  }
  return out;
}

const asId = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;

/** The change keys one statement implies. Pure; the unit tests pin the shapes. */
export function keysOfStatement(sql: string, params: unknown[]): string[] {
  const verb = VERB.exec(sql);
  if (!verb) return [];
  const table = verb[2].toLowerCase();
  const spec = TABLES[table];
  if (!spec) return [];

  const keys = new Set<string>(spec.lists);
  const wanted: Record<string, string> = { ...(spec.refs ?? {}) };
  if (spec.row) wanted.id = spec.row;

  const found = new Map<string, string[]>();
  const note = (column: string, value: unknown) => {
    const id = asId(value);
    if (!id) return;
    const list = found.get(column) ?? [];
    list.push(id);
    found.set(column, list);
  };

  if (/^\s*insert/i.test(sql)) {
    for (const [column, ordinals] of insertedValues(sql)) {
      for (const ordinal of ordinals) note(column, params[ordinal]);
    }
  } else {
    for (const bound of boundColumns(sql)) {
      for (const position of bound.positions) note(bound.column, params[ordinalOf(sql, position)]);
    }
  }

  for (const [column, prefix] of Object.entries(wanted)) {
    for (const id of found.get(column) ?? []) keys.add(`${prefix}:${id}`);
  }
  // Grants are polymorphic: the target names its own kind.
  if (table === 'access_grants') {
    const types = found.get('target_type') ?? [];
    const ids = found.get('target_id') ?? [];
    types.forEach((type, i) => {
      if (['entry', 'case', 'board'].includes(type) && ids[i]) keys.add(`${type}:${ids[i]}`);
    });
  }
  return [...keys];
}

/* ------------------------------------------------------------ the queue */

type Queue = { pending: Set<string>; timer: ReturnType<typeof setTimeout> | null; deliver: Deliver | null };
const globalForQueue = globalThis as unknown as { __zcfChangeQueue?: Queue };
const queue: Queue = globalForQueue.__zcfChangeQueue ?? { pending: new Set(), timer: null, deliver: null };
globalForQueue.__zcfChangeQueue = queue;

/** Where the keys go. Set once by the hub module so this file need not import it (and Yjs with it). */
export function setChangeDelivery(deliver: Deliver) {
  queue.deliver = deliver;
}

function flush() {
  queue.timer = null;
  if (!queue.pending.size) return;
  const keys = [...queue.pending];
  queue.pending.clear();
  try {
    queue.deliver?.(keys);
  } catch (err) {
    console.error('[live] change delivery failed:', err);
  }
}

/** Something changed that the ORM did not see (a file, raw SQL). Tabs watching these keys are told. */
export function touch(...keys: string[]) {
  for (const key of keys) queue.pending.add(key);
  if (!queue.timer) queue.timer = setTimeout(flush, 0);
}

/** Deliver everything queued now — for tests and shutdown. */
export function flushChanges() {
  if (queue.timer) clearTimeout(queue.timer);
  flush();
}

/** The ORM logger: every statement passes through here. Reads are free; writes become keys. */
export const changeLogger: Logger = {
  logQuery(sql: string, params: unknown[]) {
    if (!/^\s*(insert|update|delete)/i.test(sql)) return;
    try {
      const keys = keysOfStatement(sql, params);
      if (keys.length) touch(...keys);
    } catch (err) {
      // A statement the parser trips on must never fail the write.
      console.error('[live] could not read statement for change keys:', err);
    }
  },
};
