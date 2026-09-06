import type { FieldDef } from '@/lib/db/schema';
import type { PageBlock } from '@/lib/pageBlocks';

/**
 * §38: the infobox is the Keeper's list, on the server too.
 *
 * The *keys* of an artikel's infobox have always been the Keeper's: `FieldsEditor`
 * walks the `FieldDef[]` of the soort and nothing else, so a key nobody
 * configured renders nowhere. The server did not agree. `updateEntry` merged
 * whatever arrived — `values.fields = { ...entry.fields, ...patch.fields }` —
 * so a hand-rolled `PATCH`, or a client that put a `field.whatever` text into a
 * live room it may write in, could store a key and a shape the archive has no
 * word for. This module is the gate: a value is written only if the soort asked
 * for it, and only in the shape that soort's kind actually has.
 *
 * Pure on purpose — it opens no database — so the same rule can be read by a
 * client component and enforced by the server.
 *
 * **A key has two sources, not one.** `entry_types.fields[].key` is the obvious
 * one. The other is a hand-filled list block: `cleanBlocks` gives every
 * `kind: 'links'` block its own `key` (`lib/pageBlocks.ts`), the page builds a
 * synthetic `entry_links` FieldDef out of it (`components/entry/EntryView.tsx`),
 * and its chosen artikelen live in `entries.fields` under that key like any
 * other field. Validating against `typeFields` alone would silently empty every
 * hand-filled list on every artikel, so `listBlockKeys` is not optional — see
 * `allowedFieldKeys`.
 *
 * What this deliberately does **not** do:
 *
 *  - it never touches what is already stored. A patch is filtered; the merge
 *    base `{ ...entry.fields }` is not. That is what keeps `TypeEditor`'s
 *    promise that a field taken away and put back brings its value with it,
 *    and it is why a *retype* is not a coercion: `text` becoming `number`
 *    leaves the old `"veertien"` exactly where it was. Nothing migrates.
 *  - it does not normalise a `date`. `lib/timelines/moment.ts` writes
 *    `formatWhen` output back into `fields.date` and reads it again with
 *    `parseDutchDate`; a "helpful" reformat here would break that round trip
 *    and drag every gebeurtenis of the artikel with it (§35).
 *  - it checks no ids against the database. "Is this a well-shaped reference?"
 *    is a shape question and belongs here; "does that artikel exist, and may
 *    you see it?" is answered where it always was, per viewer, at read time.
 */

/** The longest a string field may be. Longer is cut, not refused. */
export const MAX_FIELD_TEXT = 4000;

/** The most references one list field may hold. */
const MAX_REFS = 200;

/** What a `entry_link` / `entry_links` value looks like once stored. */
export type StoredEntryRef = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  colour?: string | null;
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * The one place that says what "empty" means. Every kind accepts it, because
 * clearing a field is not a rejected value — it is a value.
 */
const isBlank = (value: unknown) => value === null || value === undefined || value === '';

/** A string field's value: a text, or something that plainly is one. */
function asText(value: unknown): string | undefined {
  if (isBlank(value)) return '';
  if (typeof value === 'string') return value.slice(0, MAX_FIELD_TEXT);
  // A number or a boolean is a text somebody typed loosely; an object or an
  // array is not, and `String()` would store the word "[object Object]".
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, MAX_FIELD_TEXT);
  }
  return undefined;
}

/** One artikel reference, kept only if it has the id and name a chip needs. */
function asEntryRef(value: unknown): StoredEntryRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return undefined;
  const ref: StoredEntryRef = { id: id.slice(0, 64), name: name.slice(0, 200), slug: str(raw.slug) ?? '' };
  const icon = str(raw.icon);
  const colour = str(raw.colour);
  if (icon) ref.icon = icon.slice(0, 40);
  if (colour) ref.colour = colour.slice(0, 40);
  return ref;
}

/**
 * One dossier reference. `caseIdsIn` accepts a bare string as well as `{ id }`,
 * because a field that changed from `case_link` to `case_links` must not lose
 * what was in it; the same courtesy is extended here, and the result is stored
 * in the one shape `CasePicker` writes.
 */
function asCaseRef(value: unknown): { id: string } | undefined {
  const bare = str(value);
  if (bare) return { id: bare.slice(0, 64) };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const id = str((value as Record<string, unknown>).id);
  return id ? { id: id.slice(0, 64) } : undefined;
}

/** One player. Only the two things `UserPicker` writes and the page prints. */
function asUserRef(value: unknown): { id: string; username: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id);
  const username = str(raw.username);
  if (!id || !username) return undefined;
  return { id: id.slice(0, 64), username: username.slice(0, 200) };
}

function asList<T>(value: unknown, one: (item: unknown) => T | undefined): T[] | undefined {
  if (isBlank(value)) return [];
  if (!Array.isArray(value)) return undefined;
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_REFS)) {
    const kept = one(item);
    if (!kept) continue;
    const id = (kept as { id?: string }).id ?? '';
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(kept);
  }
  return out;
}

/**
 * One value, measured against the definition the Keeper wrote. Returns the
 * value to store, or `undefined` for "this is not a value of this kind" — the
 * caller drops it rather than storing something the page cannot draw.
 */
export function coerceFieldValue(def: FieldDef, value: unknown): unknown | undefined {
  switch (def.kind) {
    case 'text':
    case 'longtext':
      return asText(value);

    // Stored exactly as it was typed. See the note at the top: `writeEntryDate`
    // puts `formatWhen` output in here and `parseDutchDate` reads it back, so
    // the round trip only survives if nothing in between is clever.
    case 'date':
      return asText(value);

    /*
     * §38: a Getal is stored as a JS number, not as the text of one, so a page
     * can print it in Dutch and a future sort can compare it. A box types a
     * string, so a string that reads as a finite number is taken; `NaN`,
     * `Infinity`, `"abc"`, a boolean and an object are not numbers and are
     * refused rather than stored as something no reader can draw.
     *
     * This coerces the *incoming patch*, which is the gate's job. It is not a
     * migration: a value already stored under a field that used to be a `text`
     * is never touched, so a retyped field keeps its old `"veertien"`.
     */
    case 'number': {
      if (isBlank(value)) return null;
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      const typed = str(value)?.trim();
      if (!typed) return undefined;
      const parsed = Number(typed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    /*
     * §38: a Ja/nee is a real true/false and nothing else — not `1`, not
     * `"ja"`, not `"true"`, because a page that had to guess which of those
     * counted as yes would guess differently in two places. Clearing it is
     * answering "nee", which is why the empty value lands on `false`; §22 then
     * leaves a `false` off the reading face altogether.
     */
    case 'boolean':
      if (isBlank(value)) return false;
      return typeof value === 'boolean' ? value : undefined;

    case 'select': {
      if (isBlank(value)) return '';
      const text = str(value);
      if (text === null) return undefined;
      return (def.options ?? []).includes(text) ? text : undefined;
    }

    /*
     * §38: a Meerkeuze is a list of the Keeper's own options. A member that is
     * not on the list is dropped and the rest of the list survives — the way
     * `entry_links` and `case_links` treat a member they cannot recognise, and
     * not the way a single `select` treats a value off its list. A list has to
     * behave like one: taking an option away in the type editor must not start
     * refusing every save of every artikel that still names it.
     */
    case 'multiselect': {
      if (isBlank(value)) return [];
      if (!Array.isArray(value)) return undefined;
      const options = def.options ?? [];
      const out: string[] = [];
      for (const item of value.slice(0, MAX_REFS)) {
        const text = str(item);
        if (text === null || !options.includes(text) || out.includes(text)) continue;
        out.push(text);
      }
      return out;
    }

    case 'entry_link':
      return isBlank(value) ? null : asEntryRef(value);

    case 'entry_links':
      return asList(value, asEntryRef);

    case 'user_link':
      return isBlank(value) ? null : asUserRef(value);

    case 'case_link':
      return isBlank(value) ? null : asCaseRef(value);

    case 'case_links':
      return asList(value, asCaseRef);

    // §19: a speld lives in `map_pins`, on the landkaart itself. The kind is
    // still offered so an old type keeps rendering its explanatory line, but
    // nothing writes a value into it any more — so the only value it takes is
    // the one that clears it.
    case 'map_pin':
      return isBlank(value) ? null : undefined;

    default:
      return undefined;
  }
}

/**
 * The keys of the hand-filled lists on a soort's page — the second source of
 * the whitelist. Mirrors what `EntryView` renders (`block.key ?? block.id`),
 * so what the page can fill in is exactly what the server will accept.
 *
 * Hand the *resolved* blocks (`resolveBlocks(type.blocks)`); a raw saved list
 * has not been through `cleanBlocks` and may not have its keys yet.
 */
export function listBlockKeys(blocks: PageBlock[] | undefined | null): string[] {
  if (!Array.isArray(blocks)) return [];
  const out: string[] = [];
  for (const block of blocks) {
    if (!block || block.kind !== 'links') continue;
    const key = block.key ?? block.id;
    if (typeof key === 'string' && key) out.push(key);
  }
  return out;
}

/** Every key an artikel of this soort may have a value under, both sources. */
export function allowedFieldKeys(defs: FieldDef[], listKeys: string[]): Set<string> {
  const keys = new Set<string>();
  for (const def of defs ?? []) if (def && typeof def.key === 'string' && def.key) keys.add(def.key);
  for (const key of listKeys ?? []) if (key) keys.add(key);
  return keys;
}

/**
 * The definition a key is measured against. A configured field brings its own;
 * a hand-filled list block is a list of artikelen and nothing else, which is
 * the synthetic FieldDef `EntryView` already builds for it.
 */
function defsByKey(defs: FieldDef[], listKeys: string[]): Map<string, FieldDef> {
  const map = new Map<string, FieldDef>();
  for (const def of defs ?? []) {
    if (def && typeof def.key === 'string' && def.key) map.set(def.key, def);
  }
  for (const key of listKeys ?? []) {
    if (key && !map.has(key)) map.set(key, { key, label: key, kind: 'entry_links' });
  }
  return map;
}

/**
 * Names that mean something to an object rather than to an artikel. Refused
 * outright, whatever the soort says: `isFieldKey` in `lib/pageBlocks.ts` would
 * happily let `__proto__` through, and writing one into the accumulator below
 * would set a prototype rather than a field.
 */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type FieldPatchResult = {
  /** What may be written. Everything else is simply not here. */
  fields: Record<string, unknown>;
  /** The keys that were thrown away, so a plain save can say so. */
  rejected: string[];
};

/**
 * The gate, with its reasons. `updateEntry` uses this: a live room drops the
 * rejects in silence (a CRDT that got a 400 back would retry for ever), a plain
 * `PATCH` hands them to the caller.
 */
export function checkFieldPatch(
  defs: FieldDef[],
  listKeys: string[],
  patch: Record<string, unknown>,
): FieldPatchResult {
  const known = defsByKey(defs, listKeys);
  const fields: Record<string, unknown> = {};
  const rejected: string[] = [];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { fields, rejected };

  for (const [key, value] of Object.entries(patch)) {
    const def = RESERVED_KEYS.has(key) ? undefined : known.get(key);
    // A key this soort never asked for is not stored. Not blanked, not kept —
    // never written, so an orphan already in the row is untouched by it.
    if (!def) {
      rejected.push(key);
      continue;
    }
    const kept = coerceFieldValue(def, value);
    if (kept === undefined) {
      rejected.push(key);
      continue;
    }
    fields[key] = kept;
  }
  return { fields, rejected };
}

/** The gate, when only the result matters. */
export function cleanFieldPatch(
  defs: FieldDef[],
  listKeys: string[],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return checkFieldPatch(defs, listKeys, patch).fields;
}

/**
 * §38: what is still stored under a key the soort no longer has.
 *
 * Taking a field away has never destroyed anything — `TypeEditor` promises the
 * value comes back with the field — but until now there was no way to see how
 * much was being kept, and no way to be rid of it on purpose. This counts it;
 * the Keeper's editor prints the count and offers the one button that deletes.
 *
 * Pure, so the count can be tested without a database.
 */
export function orphanValueCounts(
  allowed: Set<string>,
  rows: Record<string, unknown>[],
): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [key, value] of Object.entries(row)) {
      if (allowed.has(key)) continue;
      // An empty value is not a value worth warning anybody about.
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value) && !value.length) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
