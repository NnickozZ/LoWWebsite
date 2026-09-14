import { isFieldRole } from './roles';
import { isFrameKind } from './frames';
import {
  nodeId,
  type FamilyTreePatch,
  type FamilyTreeState,
  type FrameKind,
  type LooseCard,
  type NodeRef,
  type TreeMember,
  type TreeTie,
  type TreeTombstones,
} from './types';

/**
 * §66 — the stamboom's own document and its merge rule.
 *
 * A stamboom is a *window* onto kinship that lives on the artikelen, so this
 * blob is deliberately thin: who stands in the tree, where a hand pinned them,
 * the loose cards that are not artikelen yet, and the lines that touch a loose
 * card. **A line between two artikelen is never stored here** — it is a field on
 * one of them, and `normaliseTreeState` drops such a tie on the way in, on the
 * server and in the browser alike. Two places to write one fact is how two
 * places start to disagree.
 *
 * Modelled on `lib/boards/merge.ts` (§8, §61) and it keeps that file's two
 * load-bearing properties:
 *
 * 1. **Absence is never deletion.** A patch carries only what one hand changed;
 *    a deletion is a tombstone, written down, so a stale client cannot wipe a
 *    tree by saving what its screen happens to hold.
 * 2. **Last writer wins per *item*, never per document.** Two people moving two
 *    different people in the same second both land.
 *
 * Pure — no database, no React — so `tests/unit/family-merge.test.ts` can pin
 * the concurrency behaviour down and a client component may import it.
 */

/** How long a deletion is remembered. The board's number, for the board's reason. */
export const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** And a hard ceiling, so a scripted client cannot grow the row without bound. */
export const TOMBSTONE_LIMIT = 500;

/**
 * How big a tree may get. A stamboom of four hundred people is already far past
 * anything a table will read at a glance, and the layout is O(n·log n) rather
 * than free; the caps are here so one scripted client cannot hand the canvas a
 * document it cannot draw. Beyond the cap the **oldest** are dropped, because
 * what somebody just added is the thing they are looking at.
 */
export const MAX_MEMBERS = 400;
export const MAX_LOOSE = 200;
export const MAX_TIES = 800;

/** How long a loose card's name and its line or two may be. */
const MAX_NAME = 120;
const MAX_TEXT = 400;
/** And the word on a line. */
const MAX_LABEL = 120;

export function emptyTreeState(): FamilyTreeState {
  return { v: 1, members: [], loose: [], ties: [], deleted: { members: {}, loose: {}, ties: {} } };
}

/** Short random ids, the shape `newCardId` uses on a prikbord. */
export function newLooseId(): string {
  return `l_${Math.random().toString(36).slice(2, 12)}`;
}
export function newTieId(): string {
  return `t_${Math.random().toString(36).slice(2, 12)}`;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** A one-line box: the surrounding space goes first, so the cap counts real letters. */
function trimmed(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stamp(value: unknown, now: number): number {
  const at = finite(value);
  return at === undefined ? now : at;
}

/** A position and a pin, spelled once because a member and a loose card share it. */
function placement(raw: { x?: unknown; y?: unknown; pinned?: unknown }): {
  x?: number;
  y?: number;
  pinned?: true;
} {
  const x = finite(raw.x);
  const y = finite(raw.y);
  return {
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(raw.pinned ? { pinned: true as const } : {}),
  };
}

/** An end of a line: `{ kind: 'entry' | 'loose', id }` and nothing else. */
function normaliseRef(input: unknown): NodeRef | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { kind?: unknown; id?: unknown };
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (raw.kind !== 'entry' && raw.kind !== 'loose') return null;
  return { kind: raw.kind, id: raw.id };
}

function sameRef(a: NodeRef, b: NodeRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function normaliseMember(input: unknown, now: number): TreeMember | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<TreeMember>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  return { id: raw.id, ...placement(raw), updatedAt: stamp(raw.updatedAt, now) };
}

function normaliseLoose(input: unknown, now: number): LooseCard | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<LooseCard> & { frame?: unknown };
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const frame: FrameKind = isFrameKind(raw.frame) ? raw.frame : 'unknown';
  return {
    id: raw.id,
    name: trimmed(raw.name, MAX_NAME),
    text: text(raw.text, MAX_TEXT),
    frame,
    ...placement(raw),
    updatedAt: stamp(raw.updatedAt, now),
  };
}

/**
 * A line, made safe. Four things get one dropped, and the third is the rule this
 * whole file exists to keep:
 *
 *   - an end that is not a well-formed `NodeRef`, or a role that is not one of
 *     the four;
 *   - a line from something to itself;
 *   - **both ends `entry`** — kinship between two artikelen is a field on one of
 *     them (`lib/families/roles.ts`), and storing it here as well would give the
 *     archive two answers to one question;
 *   - nothing else. A line to a loose card that is not in this tree is kept, so
 *     a patch may send the line and the card in either order.
 *
 * A `partner` line — and since §67 a `sibling` line — has its ends sorted, so
 * the same pair sent from either side collapses to one row instead of drawing
 * twice.
 */
function normaliseTie(input: unknown, now: number): TreeTie | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<TreeTie> & { role?: unknown };
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (!isFieldRole(raw.role)) return null;

  let from = normaliseRef(raw.from);
  let to = normaliseRef(raw.to);
  if (!from || !to) return null;
  if (sameRef(from, to)) return null;
  if (from.kind === 'entry' && to.kind === 'entry') return null;

  // §67: a `sibling` line is undirected too, and is sorted for the same reason.
  if ((raw.role === 'partner' || raw.role === 'sibling') && nodeId(from) > nodeId(to)) {
    [from, to] = [to, from];
  }

  const label = trimmed(raw.label, MAX_LABEL);
  return {
    id: raw.id,
    from,
    to,
    role: raw.role,
    ...(label ? { label } : {}),
    updatedAt: stamp(raw.updatedAt, now),
  };
}

/**
 * The newest item per id, in the order the ids were first seen, and never more
 * than `cap` of them. A duplicate id is a client that sent the same person
 * twice; the newer stamp is the one that means something.
 */
function collapse<T extends { id: string; updatedAt: number }>(items: T[], cap: number): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current || item.updatedAt >= current.updatedAt) byId.set(item.id, item);
  }
  const kept = [...byId.values()];
  if (kept.length <= cap) return kept;
  // Past the cap the oldest go. Which ones those are is decided on the stamp,
  // with the later arrival winning a tie, so the answer does not depend on the
  // order a Map happened to hand them back.
  const survivors = new Set(
    kept
      .map((item, order) => ({ item, order }))
      .sort((a, b) => b.item.updatedAt - a.item.updatedAt || b.order - a.order)
      .slice(0, cap)
      .map((row) => row.item.id),
  );
  return kept.filter((item) => survivors.has(item.id));
}

/**
 * Reads whatever is in the column, drops anything expired, and keeps the most
 * recent `TOMBSTONE_LIMIT`. Insertion order is the tiebreak, for the reason
 * §61 wrote down on the board: six hundred deletions in one gesture all carry
 * the same `now`, and a sort on the stamp alone would throw away the half that
 * arrived last.
 */
function normaliseTombstones(input: unknown, now: number): TreeTombstones {
  const out: TreeTombstones = { members: {}, loose: {}, ties: {} };
  if (!input || typeof input !== 'object') return out;
  const raw = input as Partial<TreeTombstones>;
  for (const key of ['members', 'loose', 'ties'] as const) {
    const source = raw[key];
    if (!source || typeof source !== 'object') continue;
    const entries = Object.entries(source)
      .filter(
        ([id, at]) =>
          typeof id === 'string' &&
          id.length > 0 &&
          id.length <= 64 &&
          typeof at === 'number' &&
          Number.isFinite(at) &&
          now - at < TOMBSTONE_TTL_MS,
      )
      .map((entry, order) => ({ entry, order }))
      .sort((a, b) => b.entry[1] - a.entry[1] || b.order - a.order)
      .slice(0, TOMBSTONE_LIMIT)
      .map((row) => row.entry);
    out[key] = Object.fromEntries(entries);
  }
  return out;
}

/**
 * Accepts anything out of the database or off the wire and returns a valid tree.
 *
 * Forgiving on purpose, and that forgiveness *is* the migration (CLAUDE.md §5,
 * the board-state rule): a new field on a member gets its default here and no
 * SQL is written. A tree saved before a field existed reads back with it.
 */
export function normaliseTreeState(raw: unknown, now = Date.now()): FamilyTreeState {
  const input = (raw ?? {}) as Partial<FamilyTreeState>;

  const members = collapse(
    (Array.isArray(input.members) ? input.members : [])
      .map((item) => normaliseMember(item, now))
      .filter((item): item is TreeMember => Boolean(item)),
    MAX_MEMBERS,
  );

  const loose = collapse(
    (Array.isArray(input.loose) ? input.loose : [])
      .map((item) => normaliseLoose(item, now))
      .filter((item): item is LooseCard => Boolean(item)),
    MAX_LOOSE,
  );

  const ties = collapse(
    (Array.isArray(input.ties) ? input.ties : [])
      .map((item) => normaliseTie(item, now))
      .filter((item): item is TreeTie => Boolean(item)),
    MAX_TIES,
  );

  return { v: 1, members, loose, ties, deleted: normaliseTombstones(input.deleted, now) };
}

/** The artikelen standing in this tree. */
export function stateEntryIds(state: FamilyTreeState): string[] {
  return state.members.map((member) => member.id);
}

/** And the loose cards. */
export function looseIdsIn(state: FamilyTreeState): string[] {
  return state.loose.map((card) => card.id);
}

/** Which ids one merge actually moved — what the live signal and the canvas ask. */
export type TreeChanged = { members: string[]; loose: string[]; ties: string[] };

/**
 * §66: merge by id, exactly as §8 does on a prikbord.
 *
 * Per item: a patched item replaces the stored one when its `updatedAt` is
 * newer-or-equal (equal wins, because the two writes then describe the same
 * moment and the arriving one is the one somebody is looking at). Items the
 * sender has never heard of survive untouched. Deletions are explicit, become
 * tombstones stamped `now`, and refuse an item that arrives with an older stamp
 * — which is what stops a hand that was mid-drag from handing back a person
 * somebody else just took out of the tree. A deliberate re-add carries a stamp
 * at or past the tombstone and lifts it.
 *
 * Deletions in the patch are applied *after* its items, so one save that both
 * changes and removes a person removes them.
 */
export function mergeTreeState(
  current: FamilyTreeState,
  patch: FamilyTreePatch,
  now = Date.now(),
): { state: FamilyTreeState; changed: TreeChanged } {
  const base = normaliseTreeState(current, now);
  const tombstones: TreeTombstones = {
    members: { ...base.deleted.members },
    loose: { ...base.deleted.loose },
    ties: { ...base.deleted.ties },
  };
  const changed: TreeChanged = { members: [], loose: [], ties: [] };

  const members = new Map(base.members.map((item) => [item.id, item]));
  const loose = new Map(base.loose.map((item) => [item.id, item]));
  const ties = new Map(base.ties.map((item) => [item.id, item]));

  /** One kind of item, one rule. */
  function apply<T extends { id: string; updatedAt: number }>(
    into: Map<string, T>,
    graves: Record<string, number>,
    incoming: (T | null)[],
    record: string[],
  ) {
    for (const item of incoming) {
      if (!item) continue;
      const buried = graves[item.id];
      // Buried later than this item was written: it stays buried. Anything else
      // is a deliberate re-add and lifts the stone.
      if (buried !== undefined && buried > item.updatedAt) continue;
      if (buried !== undefined) delete graves[item.id];
      const held = into.get(item.id);
      if (held && item.updatedAt < held.updatedAt) continue;
      into.set(item.id, item);
      record.push(item.id);
    }
  }

  apply(
    members,
    tombstones.members,
    (patch.members ?? []).map((item) => normaliseMember(item, now)),
    changed.members,
  );
  apply(loose, tombstones.loose, (patch.loose ?? []).map((item) => normaliseLoose(item, now)), changed.loose);
  apply(ties, tombstones.ties, (patch.ties ?? []).map((item) => normaliseTie(item, now)), changed.ties);

  const bury = <T>(into: Map<string, T>, graves: Record<string, number>, ids: string[], record: string[]) => {
    for (const id of ids) {
      if (typeof id !== 'string' || !id) continue;
      graves[id] = now;
      into.delete(id);
      if (!record.includes(id)) record.push(id);
    }
  };
  bury(members, tombstones.members, patch.deletedMembers ?? [], changed.members);
  bury(loose, tombstones.loose, patch.deletedLoose ?? [], changed.loose);
  bury(ties, tombstones.ties, patch.deletedTies ?? [], changed.ties);

  // Anything the tree already knew was gone stays gone, whatever the base row
  // happened to still contain.
  for (const id of Object.keys(tombstones.members)) members.delete(id);
  for (const id of Object.keys(tombstones.loose)) loose.delete(id);
  for (const id of Object.keys(tombstones.ties)) ties.delete(id);

  /*
   * A line hangs on two things. Take one of them out of the tree and the line
   * has nowhere to hang, so it goes with it — a tie left pointing at a buried
   * loose card would come back the moment somebody re-added a card with the same
   * id, which is not a line anybody drew.
   */
  for (const tie of [...ties.values()]) {
    const dangling = [tie.from, tie.to].some((end) =>
      end.kind === 'loose' ? end.id in tombstones.loose : end.id in tombstones.members,
    );
    if (!dangling) continue;
    ties.delete(tie.id);
    if (!changed.ties.includes(tie.id)) changed.ties.push(tie.id);
  }

  const state = normaliseTreeState(
    {
      v: 1,
      members: [...members.values()],
      loose: [...loose.values()],
      ties: [...ties.values()],
      deleted: tombstones,
    },
    now,
  );
  return { state, changed };
}
