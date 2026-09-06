import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  allowedFieldKeys,
  checkFieldPatch,
  cleanFieldPatch,
  coerceFieldValue,
  listBlockKeys,
  orphanValueCounts,
} from '@/lib/entries/fieldValues';
import { formatWhen, parseDutchDate, partsToSeconds } from '@/lib/timelines/time';
import type { FieldDef } from '@/lib/db/schema';
import type { PageBlock } from '@/lib/pageBlocks';

/**
 * §38: the infobox is the Keeper's list, on the server as well as on the page.
 *
 * The keys were already the Keeper's in the UI — `FieldsEditor` walks the
 * soort's `FieldDef[]` and nothing else — but `updateEntry` merged whatever
 * arrived, and there are two doors into it: a hand-rolled `PATCH`, and the §21
 * fields room, which sweeps every `field.*` name out of a Yjs document and
 * hands it straight on. Both are gated in one seam now, and this file is what
 * says so.
 *
 * Four claims matter more than the rest:
 *
 *  1. **A key has two sources.** A hand-filled list block's values live in
 *     `entries.fields` under the block's own key, with no `FieldDef` anywhere
 *     — so a gate that only knew `entry_types.fields` would empty every one of
 *     them on the next save. The half of the suite with a real database is
 *     there for that one.
 *  2. **Nothing stored is ever destroyed.** Only the incoming patch is
 *     filtered; the merge base is not. A field taken away keeps its value, and
 *     a field *retyped* keeps its old value too — a value that no longer fits
 *     its kind is not migrated, corrected or wiped.
 *  3. **A date is stored as typed.** `writeEntryDate` puts `formatWhen` output
 *     in there and `momentFromEntry` reads it back with `parseDutchDate` (§35);
 *     a gate that tidied the string would move every gebeurtenis of the
 *     artikel.
 *  4. **The live room may not invent a key**, and is told nothing when it
 *     tries. A CRDT handed a refusal would send the same keystroke again for
 *     ever, so the room drops in silence and only a plain save is told.
 */

const text: FieldDef = { key: 'occupation', label: 'Beroep', kind: 'text' };
const long: FieldDef = { key: 'sanity_note', label: 'Toestand', kind: 'longtext' };
const status: FieldDef = {
  key: 'status',
  label: 'Status',
  kind: 'select',
  options: ['levend', 'dood', 'vermist'],
};
const date: FieldDef = { key: 'date', label: 'Datum', kind: 'date' };
const tonnage: FieldDef = { key: 'tonnage', label: 'Tonnage', kind: 'number' };
const missing: FieldDef = { key: 'vermist', label: 'Vermist', kind: 'boolean' };
const cargo: FieldDef = {
  key: 'lading',
  label: 'Lading',
  kind: 'multiselect',
  options: ['zout', 'graan', 'kolen'],
};
const one: FieldDef = { key: 'faction', label: 'Factie', kind: 'entry_link' };
const many: FieldDef = { key: 'involved', label: 'Betrokkenen', kind: 'entry_links' };
const player: FieldDef = { key: 'player', label: 'Speler', kind: 'user_link' };
const dossier: FieldDef = { key: 'zaak', label: 'Dossier', kind: 'case_link' };
const dossiers: FieldDef = { key: 'zaken', label: 'Dossiers', kind: 'case_links' };
const speld: FieldDef = { key: 'plek', label: 'Speld', kind: 'map_pin' };

const ALL = [
  text,
  long,
  status,
  date,
  tonnage,
  missing,
  cargo,
  one,
  many,
  player,
  dossier,
  dossiers,
  speld,
];
const ref = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() });

describe('one value, measured against its kind', () => {
  it('takes a text and cuts a runaway one', () => {
    expect(coerceFieldValue(text, 'visser')).toBe('visser');
    expect(String(coerceFieldValue(long, 'x'.repeat(9000)))).toHaveLength(4000);
  });

  it('treats an empty value as clearing the field, for every kind', () => {
    for (const def of ALL) expect(coerceFieldValue(def, '')).not.toBeUndefined();
    expect(coerceFieldValue(text, null)).toBe('');
    expect(coerceFieldValue(one, null)).toBeNull();
    expect(coerceFieldValue(many, null)).toEqual([]);
  });

  it('refuses an object where a text belongs, rather than storing “[object Object]”', () => {
    expect(coerceFieldValue(text, { nope: 1 })).toBeUndefined();
    expect(coerceFieldValue(text, ['a'])).toBeUndefined();
    // A number typed loosely is still a text somebody meant.
    expect(coerceFieldValue(text, 40)).toBe('40');
  });

  it('gives a select only its own options', () => {
    expect(coerceFieldValue(status, 'dood')).toBe('dood');
    expect(coerceFieldValue(status, 'ondood')).toBeUndefined();
    expect(coerceFieldValue(status, 'DOOD')).toBeUndefined();
    // A select with no options yet takes nothing but the empty answer.
    expect(coerceFieldValue({ ...status, options: [] }, 'dood')).toBeUndefined();
    expect(coerceFieldValue(status, '')).toBe('');
  });

  /* --------------------------------------------- §38: the three typed kinds */

  it('stores a Getal as a number, and refuses anything that is not one', () => {
    expect(coerceFieldValue(tonnage, 1400)).toBe(1400);
    expect(coerceFieldValue(tonnage, -12.5)).toBe(-12.5);
    expect(coerceFieldValue(tonnage, 0)).toBe(0);
    // A box types a string; a string that reads as a finite number is taken.
    expect(coerceFieldValue(tonnage, '1400')).toBe(1400);
    expect(coerceFieldValue(tonnage, ' -12.5 ')).toBe(-12.5);

    // …and nothing else is a number.
    expect(coerceFieldValue(tonnage, Number.NaN)).toBeUndefined();
    expect(coerceFieldValue(tonnage, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(coerceFieldValue(tonnage, Number.NEGATIVE_INFINITY)).toBeUndefined();
    expect(coerceFieldValue(tonnage, 'abc')).toBeUndefined();
    expect(coerceFieldValue(tonnage, 'Infinity')).toBeUndefined();
    expect(coerceFieldValue(tonnage, '  ')).toBeUndefined();
    expect(coerceFieldValue(tonnage, true)).toBeUndefined();
    expect(coerceFieldValue(tonnage, [1])).toBeUndefined();
    expect(coerceFieldValue(tonnage, { value: 1 })).toBeUndefined();

    // Clearing it is emptying it, not writing a zero.
    expect(coerceFieldValue(tonnage, '')).toBeNull();
    expect(coerceFieldValue(tonnage, null)).toBeNull();
  });

  it('stores a Ja/nee as a real true or false, and guesses at nothing', () => {
    expect(coerceFieldValue(missing, true)).toBe(true);
    expect(coerceFieldValue(missing, false)).toBe(false);
    // Clearing it is answering "nee".
    expect(coerceFieldValue(missing, '')).toBe(false);
    expect(coerceFieldValue(missing, null)).toBe(false);

    // Everything that merely looks like a yes is refused: a page that had to
    // decide which of these counted would decide differently in two places.
    for (const nope of ['ja', 'true', 'nee', 'false', 1, 0, [], {}]) {
      expect(coerceFieldValue(missing, nope)).toBeUndefined();
    }
  });

  it('gives a Meerkeuze only the Keeper’s options, deduped and in the order chosen', () => {
    expect(coerceFieldValue(cargo, ['kolen', 'zout'])).toEqual(['kolen', 'zout']);
    expect(coerceFieldValue(cargo, ['zout', 'zout', 'graan', 'zout'])).toEqual(['zout', 'graan']);

    // An answer that is not on the list is dropped and the rest survives — the
    // way `entry_links` treats a member it cannot recognise, and not the way a
    // single `select` treats a value off its list. Taking an option away in the
    // type editor must not start refusing every save that still names it.
    expect(coerceFieldValue(cargo, ['zout', 'smokkelwaar', 'kolen'])).toEqual(['zout', 'kolen']);
    expect(coerceFieldValue(cargo, ['ZOUT'])).toEqual([]);
    expect(coerceFieldValue(cargo, [7, null, { id: 'zout' }, 'graan'])).toEqual(['graan']);
    // A Meerkeuze with no options yet takes nothing but the empty answer.
    expect(coerceFieldValue({ ...cargo, options: [] }, ['zout'])).toEqual([]);

    // A list is a list. A bare answer is not one.
    expect(coerceFieldValue(cargo, 'zout')).toBeUndefined();
    expect(coerceFieldValue(cargo, { 0: 'zout' })).toBeUndefined();

    expect(coerceFieldValue(cargo, '')).toEqual([]);
    expect(coerceFieldValue(cargo, null)).toEqual([]);
  });

  it('keeps a reference only when it is shaped like one', () => {
    expect(coerceFieldValue(one, ref('e1', 'Anneke'))).toEqual({
      id: 'e1',
      name: 'Anneke',
      slug: 'anneke',
    });
    expect(coerceFieldValue(one, { id: 'e1' })).toBeUndefined();
    expect(coerceFieldValue(one, 'e1')).toBeUndefined();
    // Anything unrecognised in the list is dropped; the list itself survives.
    expect(coerceFieldValue(many, [ref('e1', 'Anneke'), { id: 'e2' }, null, 'e3'])).toEqual([
      { id: 'e1', name: 'Anneke', slug: 'anneke' },
    ]);
    // And a list is a list. A bare reference is not one.
    expect(coerceFieldValue(many, ref('e1', 'Anneke'))).toBeUndefined();
  });

  it('drops a name and a colour it was not given, and never invents one', () => {
    expect(coerceFieldValue(one, { id: 'e1', name: 'Anneke' })).toEqual({
      id: 'e1',
      name: 'Anneke',
      slug: '',
    });
    expect(coerceFieldValue(one, { id: 'e1', name: 'Anneke', slug: 'a', evil: 'x' })).toEqual({
      id: 'e1',
      name: 'Anneke',
      slug: 'a',
    });
  });

  it('stores a dossier as an id and a player as an account', () => {
    expect(coerceFieldValue(dossier, { id: 'c1', name: 'De haven' })).toEqual({ id: 'c1' });
    // The shape a field that used to be a `case_link` was written in.
    expect(coerceFieldValue(dossiers, ['c1', { id: 'c2' }, { name: 'x' }])).toEqual([
      { id: 'c1' },
      { id: 'c2' },
    ]);
    expect(coerceFieldValue(player, { id: 'u1', username: 'Bram' })).toEqual({
      id: 'u1',
      username: 'Bram',
    });
    expect(coerceFieldValue(player, { id: 'u1' })).toBeUndefined();
  });

  it('takes nothing but a clear for a speld, because spelden live on the landkaart', () => {
    expect(coerceFieldValue(speld, null)).toBeNull();
    expect(coerceFieldValue(speld, { x: 0.5, y: 0.5 })).toBeUndefined();
  });

  /** Claim 3. */
  it('stores a date exactly as typed, so formatWhen round-trips through parseDutchDate', () => {
    const at = partsToSeconds({ year: 1931, month: 3, day: 12 });
    const written = formatWhen(at, 'day');
    const stored = coerceFieldValue(date, written);
    expect(stored).toBe(written);
    expect(parseDutchDate(stored as string)).toEqual({ at, precision: 'day' });

    // Every precision the axis writes comes back at the same moment. (The
    // *precision* of an hour reads back as a minute — that is what those two
    // functions have always done, and it is not this gate's to fix; what
    // matters here is that the string arrives unchanged, so whatever
    // `parseDutchDate` made of it before, it makes of it now.)
    for (const [precision, seconds] of [
      ['year', partsToSeconds({ year: 1931 })],
      ['month', partsToSeconds({ year: 1931, month: 7 })],
      ['day', partsToSeconds({ year: 1931, month: 7, day: 4 })],
      ['hour', partsToSeconds({ year: 1931, month: 7, day: 4, hour: 21 })],
    ] as const) {
      const written = formatWhen(seconds, precision);
      const again = coerceFieldValue(date, written) as string;
      expect(again).toBe(written);
      expect(parseDutchDate(again)?.at).toBe(seconds);
    }
    // A date nobody can parse is still a value: a player may type this.
    expect(coerceFieldValue(date, 'ergens in de zomer')).toBe('ergens in de zomer');
  });
});

describe('a patch, measured against the soort', () => {
  /** Claim 1, the pure half. */
  const blocks: PageBlock[] = [
    { id: 'fields', kind: 'fields' },
    { id: 'blk_1', kind: 'links', key: 'lijst_bondgenoten', title: 'Bondgenoten' },
    { id: 'blk_2', kind: 'links', key: 'lijst_vijanden', title: 'Vijanden' },
    { id: 'blk_3', kind: 'derived', viaField: 'faction', sort: 'name' },
    { id: 'body', kind: 'body' },
  ];

  it('reads the hand-filled lists off the page, and nothing else', () => {
    expect(listBlockKeys(blocks)).toEqual(['lijst_bondgenoten', 'lijst_vijanden']);
    expect(listBlockKeys(undefined)).toEqual([]);
    // Before `cleanBlocks` a list may have no key; the page falls back to the
    // block's id, so this must too or the two would disagree.
    expect(listBlockKeys([{ id: 'blk_9', kind: 'links' }])).toEqual(['blk_9']);
  });

  it('whitelists both sources at once', () => {
    expect([...allowedFieldKeys([text, status], listBlockKeys(blocks))].sort()).toEqual([
      'lijst_bondgenoten',
      'lijst_vijanden',
      'occupation',
      'status',
    ]);
  });

  it('drops a key the soort never asked for', () => {
    const result = checkFieldPatch([text, status], [], {
      occupation: 'visser',
      geheim: 'ik ben hier nooit geweest',
      __proto__polluted: 'x',
    });
    expect(result.fields).toEqual({ occupation: 'visser' });
    expect(result.rejected.sort()).toEqual(['__proto__polluted', 'geheim']);
  });

  /** The biggest trap: a list block's key has no FieldDef anywhere. */
  it('lets a hand-filled list through, even though it has no field definition', () => {
    const listKeys = listBlockKeys(blocks);
    const kept = cleanFieldPatch([text], listKeys, {
      lijst_bondgenoten: [ref('e1', 'Anneke'), ref('e2', 'Bram')],
    });
    expect(kept.lijst_bondgenoten).toEqual([
      { id: 'e1', name: 'Anneke', slug: 'anneke' },
      { id: 'e2', name: 'Bram', slug: 'bram' },
    ]);

    // And it is treated as the `entry_links` field the page draws for it, so a
    // text in it is refused like a text in any other list.
    expect(checkFieldPatch([text], listKeys, { lijst_vijanden: 'De Schorre' }).rejected).toEqual([
      'lijst_vijanden',
    ]);

    // Without the second source it would be thrown away — the silent breakage
    // this test exists to stop.
    expect(cleanFieldPatch([text], [], { lijst_bondgenoten: [ref('e1', 'Anneke')] })).toEqual({});
  });

  it('rejects a select value that is off its own list, and keeps the rest of the patch', () => {
    const result = checkFieldPatch([text, status], [], {
      status: 'ondood',
      occupation: 'visser',
    });
    expect(result.fields).toEqual({ occupation: 'visser' });
    expect(result.rejected).toEqual(['status']);
  });

  it('refuses a name that means something to an object rather than to an artikel', () => {
    // `isFieldKey` would let `__proto__` through, and writing one straight into
    // the accumulator would set a prototype instead of storing a field.
    const evil = JSON.parse('{"__proto__": {"admin": true}, "occupation": "visser"}');
    const result = checkFieldPatch([{ ...text, key: '__proto__' }, text], [], evil);
    expect(result.fields).toEqual({ occupation: 'visser' });
    expect(result.rejected).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect(Object.getPrototypeOf(result.fields)).toBe(Object.prototype);
  });

  it('shrugs off a patch that is not an object at all', () => {
    expect(cleanFieldPatch([text], [], null as never)).toEqual({});
    expect(cleanFieldPatch([text], [], ['x'] as never)).toEqual({});
  });
});

describe('counting what a soort no longer has', () => {
  it('counts a value per key, ignores the empty ones and never counts a live field', () => {
    const allowed = allowedFieldKeys([text, status], ['lijst_bondgenoten']);
    expect(
      orphanValueCounts(allowed, [
        { occupation: 'visser', beroep: 'visser', leeftijd: 40 },
        { beroep: 'smid', lijst_bondgenoten: [] },
        { beroep: '', leeftijd: null, oud: [] },
      ]),
    ).toEqual([
      { key: 'beroep', count: 2 },
      { key: 'leeftijd', count: 1 },
    ]);
  });

  it('says nothing about a soort whose values all still have a field', () => {
    const allowed = allowedFieldKeys([text], ['lijst_bondgenoten']);
    expect(
      orphanValueCounts(allowed, [{ occupation: 'visser', lijst_bondgenoten: [ref('e1', 'A')] }]),
    ).toEqual([]);
  });
});

/* ------------------------------------------------- and now, a real archive */

const dir = mkdtempSync(join(tmpdir(), 'zcf-field-values-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  admit: typeof import('@/lib/live/rooms').admit;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true, characterId: null };

const fieldsOf = (entryId: string): Record<string, unknown> =>
  JSON.parse(
    (deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(entryId) as {
      fields: string;
    }).fields,
  ) as Record<string, unknown>;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const rooms = await import('@/lib/live/rooms');
  deps = {
    sqlite: dbModule.sqlite,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
    admit: rooms.admit,
  };

  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
    )
    .run();

  // A soort with one of every interesting kind, and a page with a hand-filled
  // list on it — the second source of the whitelist, in the database.
  deps.sqlite
    .prepare(
      `INSERT INTO entry_types (id, slug, label, fields, blocks, sort_order) VALUES ('kaart', 'kaart', 'Kaarten', ?, ?, 900)`,
    )
    .run(
      JSON.stringify([text, status, date, one]),
      JSON.stringify([
        { id: 'fields', kind: 'fields' },
        { id: 'blk_1', kind: 'links', key: 'lijst_bondgenoten', title: 'Bondgenoten' },
        { id: 'body', kind: 'body' },
      ]),
    );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the gate in the archive', () => {
  it('refuses a key nobody configured, on the way in and on every save after', () => {
    const made = deps.createEntry({
      typeSlug: 'kaart',
      name: 'De eerste kaart',
      createdBy: KEEPER.id,
      fields: { occupation: 'cartograaf', geheim: 'niet opslaan' },
    });
    expect(fieldsOf(made.id)).toEqual({ occupation: 'cartograaf' });

    const saved = deps.updateEntry(made.id, { fields: { geheim: 'nog steeds niet' } }, KEEPER);
    expect(saved.status).toBe('saved');
    expect(fieldsOf(made.id)).toEqual({ occupation: 'cartograaf' });
  });

  /** Claim 1, in the database — the trap this whole round is about. */
  it('stores a hand-filled list under the block’s own key', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De tweede', createdBy: KEEPER.id });
    deps.updateEntry(
      made.id,
      { fields: { lijst_bondgenoten: [ref('e1', 'Anneke')] } },
      KEEPER,
    );
    expect(fieldsOf(made.id)).toEqual({
      lijst_bondgenoten: [{ id: 'e1', name: 'Anneke', slug: 'anneke' }],
    });
  });

  /** Claim 2. */
  it('leaves an orphaned value exactly where it is when something else is saved', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De derde', createdBy: KEEPER.id });
    // Filed under a field the soort had once. Written past the gate on purpose:
    // this is what an archive that predates the field's removal looks like.
    deps.sqlite
      .prepare('UPDATE entries SET fields = ? WHERE id = ?')
      .run(JSON.stringify({ beroep: 'visser', occupation: 'cartograaf' }), made.id);

    deps.updateEntry(made.id, { fields: { occupation: 'landmeter' } }, KEEPER);
    expect(fieldsOf(made.id)).toEqual({ beroep: 'visser', occupation: 'landmeter' });

    // Not even a save that names it can move it — it is simply never written.
    deps.updateEntry(made.id, { fields: { beroep: 'smid' } }, KEEPER);
    expect(fieldsOf(made.id).beroep).toBe('visser');
  });

  /** Claim 2, the other half: a retype is not a coercion. */
  it('leaves a value the Keeper has since retyped alone, rather than migrating it', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De vierde', createdBy: KEEPER.id });
    deps.updateEntry(made.id, { fields: { occupation: 'veertien' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe('veertien');

    // `occupation` becomes a keuzelijst that has never heard of "veertien".
    deps.sqlite
      .prepare('UPDATE entry_types SET fields = ? WHERE id = ?')
      .run(
        JSON.stringify([{ key: 'occupation', label: 'Beroep', kind: 'select', options: ['smid'] }, date]),
        'kaart',
      );

    // The stored value stands. A new one still has to be on the list.
    const refused = deps.updateEntry(made.id, { fields: { occupation: 'visser' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe('veertien');
    expect(refused.status === 'saved' && refused.rejectedFields).toEqual(['occupation']);

    deps.updateEntry(made.id, { fields: { occupation: 'smid' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe('smid');

    // Put back the way it was, for the tests below.
    deps.sqlite
      .prepare('UPDATE entry_types SET fields = ? WHERE id = ?')
      .run(JSON.stringify([text, status, date, one]), 'kaart');
  });

  /**
   * §38, and Claim 2 again for the kind that most invites a "helpful" fix: a
   * Tekst retyped to a Getal. The archive keeps the word, does not turn it into
   * a number, does not empty it, and does not decide it is `NaN`.
   */
  it('leaves an old “veertien” alone when its field becomes a Getal', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De zevende', createdBy: KEEPER.id });
    deps.updateEntry(made.id, { fields: { occupation: 'veertien' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe('veertien');

    // `occupation` becomes a Getal.
    deps.sqlite
      .prepare('UPDATE entry_types SET fields = ? WHERE id = ?')
      .run(
        JSON.stringify([{ key: 'occupation', label: 'Beroep', kind: 'number' }, date]),
        'kaart',
      );

    // Reading the artikel does not touch it, and neither does saving something
    // else on it — nothing migrates.
    deps.updateEntry(made.id, { fields: { date: '14 oktober 1934' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe('veertien');

    // A save that names it with a word is refused, and the word stands.
    const refused = deps.updateEntry(made.id, { fields: { occupation: 'vijftien' } }, KEEPER);
    expect(refused.status === 'saved' && refused.rejectedFields).toEqual(['occupation']);
    expect(fieldsOf(made.id).occupation).toBe('veertien');

    // Only a real number replaces it, and it lands as a number, not as text.
    deps.updateEntry(made.id, { fields: { occupation: '15' } }, KEEPER);
    expect(fieldsOf(made.id).occupation).toBe(15);

    deps.sqlite
      .prepare('UPDATE entry_types SET fields = ? WHERE id = ?')
      .run(JSON.stringify([text, status, date, one]), 'kaart');
  });

  /** Claim 4, first half: a plain save is told. */
  it('names what it refused on a plain save, and saves the rest of the patch anyway', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De vijfde', createdBy: KEEPER.id });
    const result = deps.updateEntry(
      made.id,
      { fields: { occupation: 'cartograaf', status: 'ondood', verzonnen: 'x' } },
      KEEPER,
    );
    expect(result.status).toBe('saved');
    expect(result.status === 'saved' && result.rejectedFields?.slice().sort()).toEqual([
      'status',
      'verzonnen',
    ]);
    expect(fieldsOf(made.id)).toEqual({ occupation: 'cartograaf' });

    // A patch of nothing but rubbish is not an edit at all: nothing is written.
    const before = deps.sqlite
      .prepare('SELECT updated_at FROM entries WHERE id = ?')
      .get(made.id) as { updated_at: number };
    const nothing = deps.updateEntry(made.id, { fields: { verzonnen: 'x' } }, KEEPER);
    expect(nothing.status === 'saved' && nothing.rejectedFields).toEqual(['verzonnen']);
    expect(
      (deps.sqlite.prepare('SELECT updated_at FROM entries WHERE id = ?').get(made.id) as {
        updated_at: number;
      }).updated_at,
    ).toBe(before.updated_at);
  });

  /** Claim 4, second half: the room may not invent a key, and is told nothing. */
  it('the live room’s field.* sweep cannot invent a key, and hears nothing about it', () => {
    const made = deps.createEntry({ typeSlug: 'kaart', name: 'De zesde', createdBy: KEEPER.id });
    const admission = deps.admit(`entry:${made.id}:fields`, KEEPER);
    expect(admission?.canEdit).toBe(true);

    // Exactly what `entryAdmission` gets handed: the strings of the Yjs doc,
    // one of them a name no soort has ever had.
    admission!.spec.persist(
      {
        name: 'De zesde',
        'field.occupation': 'cartograaf',
        'field.verzonnen': 'ik sta hier niet',
        'field.status': 'ondood',
      },
      KEEPER,
    );

    expect(fieldsOf(made.id)).toEqual({ occupation: 'cartograaf' });
    // The room is handed no refusal to retry: `persist` returns nothing, and
    // `updateEntry` is called with `{ live: true }`, which reports nothing.
    const quiet = deps.updateEntry(
      made.id,
      { fields: { verzonnen: 'x' } },
      KEEPER,
      { live: true },
    );
    expect(quiet.status === 'saved' && quiet.rejectedFields).toBeUndefined();
  });
});
