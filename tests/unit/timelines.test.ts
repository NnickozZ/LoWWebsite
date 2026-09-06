import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatWhen, partsToSeconds } from '@/lib/timelines/time';

/**
 * §32: tijdlijnen and their gebeurtenissen, behind the archive's rules.
 *
 *  1. A tijdlijn is seen and touched by the prikbord's rule: its own dials,
 *     and its dossier's. A gebeurtenis follows its tijdlijn — and, for an
 *     artikel gebeurtenis, the artikel (rule 1).
 *  2. A moment is stored as one integer with a precision, clamped to what the
 *     tijdlijn measures — non-destructively, so a coarser scale hides detail
 *     and a finer one brings it back.
 *  3. A note gebeurtenis exists nowhere else, and can become an artikel in
 *     place. What the tijdlijn says stays the tijdlijn's.
 *  4. It goes into the bin, comes back whole, and is destroyed with its
 *     gebeurtenissen and nothing else — and an artikel destroyed takes its
 *     gebeurtenissen with it, a dossier destroyed leaves its tijdlijnen loose.
 *  5. The live gate, the change keys and "Genoemd in" know the new kind.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-timelines-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  service: typeof import('@/lib/timelines/service');
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  trash: typeof import('@/lib/admin/trash');
  canWatch: typeof import('@/lib/live/gate').canWatch;
  keysOfStatement: typeof import('@/lib/live/changes').keysOfStatement;
  listMentions: typeof import('@/lib/entries/mentions').listMentions;
  resolveBoardTimelines: typeof import('@/lib/boards/service').resolveBoardTimelines;
  updateAccess: typeof import('@/lib/access').updateAccess;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

const MARCH_12 = partsToSeconds({ year: 1931, month: 3, day: 12 });
const MARCH_12_NOON = partsToSeconds({ year: 1931, month: 3, day: 12, hour: 12, minute: 30 });

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    service: await import('@/lib/timelines/service'),
    createEntry: (await import('@/lib/entries/service')).createEntry,
    updateEntry: (await import('@/lib/entries/service')).updateEntry,
    trash: await import('@/lib/admin/trash'),
    canWatch: (await import('@/lib/live/gate')).canWatch,
    keysOfStatement: (await import('@/lib/live/changes')).keysOfStatement,
    listMentions: (await import('@/lib/entries/mentions')).listMentions,
    resolveBoardTimelines: (await import('@/lib/boards/service')).resolveBoardTimelines,
    updateAccess: (await import('@/lib/access')).updateAccess,
  };
  const { sqlite } = deps;
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-open', 'Zaak Vlissingen', 'zaak-vlissingen', 'open', 'bram', 'all')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-stil', 'De brand', 'de-brand', 'open', 'aagje', 'private')`,
    )
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('who sees a tijdlijn', () => {
  it('a public one: everyone; a private one: its owner and the Keeper', () => {
    const open = deps.service.createTimeline({ name: 'De week van de brand', scale: 'day' }, BRAM);
    const closed = deps.service.createTimeline({ name: 'Mijn eigen lijn', scale: 'day', isPrivate: true }, BRAM);
    expect(open.slug).toBe('de-week-van-de-brand');

    const forAagje = deps.service.listTimelines(AAGJE).map((t) => t.id);
    expect(forAagje).toContain(open.id);
    expect(forAagje).not.toContain(closed.id);
    expect(deps.service.getTimelineById(closed.id, AAGJE)).toBeUndefined();
    expect(deps.service.getTimelineById(closed.id, BRAM)?.id).toBe(closed.id);
    expect(deps.service.getTimelineById(closed.id, KEEPER)?.id).toBe(closed.id);
  });

  it('one inside a confidential dossier is as hidden as the dossier', () => {
    const inside = deps.service.createTimeline({ name: 'In de brand', scale: 'hour', caseId: 'c-stil' }, AAGJE);
    expect(deps.service.getTimelineById(inside.id, BRAM)).toBeUndefined();
    expect(deps.service.listTimelinesForCase('c-stil', BRAM)).toEqual([]);
    expect(deps.service.listTimelinesForCase('c-stil', AAGJE).map((t) => t.id)).toEqual([inside.id]);
    expect(deps.canWatch(`timeline:${inside.id}`, BRAM)).toBe(false);
    expect(deps.canWatch(`timeline:${inside.id}`, AAGJE)).toBe(true);
  });

  it('the edit dial decides who may put something on it', () => {
    const line = deps.service.createTimeline({ name: 'Alleen kijken', scale: 'day' }, BRAM);
    deps.updateAccess('timeline', line.id, { editMode: 'private' }, BRAM);
    expect(deps.service.viewerCanEditTimeline(line.id, AAGJE)).toBe(false);
    expect(() =>
      deps.service.addEvent(line.id, { kind: 'note', name: 'Poging', at: MARCH_12 }, AAGJE),
    ).toThrow(/niet bewerken/);
    expect(deps.service.viewerCanEditTimeline(line.id, BRAM)).toBe(true);
    expect(deps.service.viewerCanEditTimeline(line.id, KEEPER)).toBe(true);
  });
});

describe('gebeurtenissen', () => {
  let lineId: string;
  let secret: string;
  let open: string;

  beforeAll(() => {
    lineId = deps.service.createTimeline({ name: 'De zaak', scale: 'day', caseId: 'c-open' }, BRAM).id;
    secret = deps.createEntry({ typeSlug: 'event', name: 'Het ritueel', createdBy: KEEPER.id }).id;
    deps.sqlite.prepare("UPDATE entries SET visibility = 'keeper' WHERE id = ?").run(secret);
    open = deps.createEntry({ typeSlug: 'event', name: 'De vondst', createdBy: BRAM.id }).id;
  });

  it('a note and an artikel, in time order, with the precision that was given', () => {
    const b = deps.service.addEvent(lineId, { kind: 'note', name: 'Storm', text: 'Hele nacht.', at: MARCH_12_NOON, precision: 'day' }, BRAM);
    const a = deps.service.addEvent(lineId, { kind: 'entry', entryId: open, at: partsToSeconds({ year: 1931, month: 3 }), precision: 'month' }, BRAM);
    const list = deps.service.listEvents(lineId, BRAM);
    expect(list.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(list[0].kind).toBe('entry');
    expect(list[0].name).toBe('De vondst');
    expect(list[0].entry?.typeSlug).toBe('event');
    expect(list[0].precision).toBe('month');
    expect(list[1].kind).toBe('note');
    expect(list[1].text).toBe('Hele nacht.');
    // Nothing without a picture starts with its frame open.
    expect(list.every((e) => e.showImage === false)).toBe(true);
  });

  it('never finer than the tijdlijn measures — and the detail comes back when it is refined', () => {
    const e = deps.service.addEvent(lineId, { kind: 'note', name: 'Om half een', at: MARCH_12_NOON, precision: 'minute' }, BRAM);
    expect(e.precision).toBe('day');
    deps.service.updateTimeline(lineId, { scale: 'minute' }, BRAM);
    expect(deps.service.getEvent(e.id, BRAM)?.precision).toBe('day');
    deps.service.updateEvent(e.id, { precision: 'minute' }, BRAM);
    expect(deps.service.getEvent(e.id, BRAM)?.precision).toBe('minute');
    deps.service.updateTimeline(lineId, { scale: 'year' }, BRAM);
    expect(deps.service.getEvent(e.id, BRAM)?.precision).toBe('year');
    deps.service.updateTimeline(lineId, { scale: 'minute' }, BRAM);
    expect(deps.service.getEvent(e.id, BRAM)?.precision).toBe('minute');
    deps.service.updateTimeline(lineId, { scale: 'day' }, BRAM);
    deps.service.removeEvent(e.id, BRAM);
  });

  it('an artikel a player may not see is not on their tijdlijn', () => {
    const hidden = deps.service.addEvent(lineId, { kind: 'entry', entryId: secret, at: MARCH_12 }, KEEPER);
    expect(deps.service.listEvents(lineId, KEEPER).map((e) => e.id)).toContain(hidden.id);
    expect(deps.service.listEvents(lineId, BRAM).map((e) => e.id)).not.toContain(hidden.id);
    expect(deps.service.getEvent(hidden.id, BRAM)).toBeUndefined();
    expect(deps.canWatch(`event:${hidden.id}`, BRAM)).toBe(false);
    expect(deps.canWatch(`event:${hidden.id}`, KEEPER)).toBe(true);
    // And a player may not put one there either.
    expect(() => deps.service.addEvent(lineId, { kind: 'entry', entryId: secret, at: MARCH_12 }, BRAM)).toThrow(/niet gevonden/i);
    // The shelf's count is per viewer too.
    const forBram = deps.service.listTimelines(BRAM).find((t) => t.id === lineId)!.eventCount;
    const forKeeper = deps.service.listTimelines(KEEPER).find((t) => t.id === lineId)!.eventCount;
    expect(forKeeper).toBe((forBram ?? 0) + 1);
  });

  it('a note keeps its name, an artikel gebeurtenis wears the artikel\'s; both keep the tijdlijn\'s own text', () => {
    const note = deps.service.listEvents(lineId, BRAM).find((e) => e.kind === 'note')!;
    expect(() => deps.service.updateEvent(note.id, { name: '  ' }, BRAM)).toThrow(/naam/);
    const renamed = deps.service.updateEvent(note.id, { name: 'De storm', text: 'Het waaide.' }, BRAM);
    expect(renamed.name).toBe('De storm');
    expect(renamed.text).toBe('Het waaide.');

    const art = deps.service.listEvents(lineId, BRAM).find((e) => e.kind === 'entry')!;
    const said = deps.service.updateEvent(art.id, { name: 'Iets anders', text: 'Wat de tijdlijn zegt.' }, BRAM);
    expect(said.name).toBe('De vondst');
    expect(said.text).toBe('Wat de tijdlijn zegt.');
    const stillTheArtikel = deps.sqlite.prepare('SELECT name, short_description AS s FROM entries WHERE id = ?').get(open) as { name: string; s: string };
    expect(stillTheArtikel).toEqual({ name: 'De vondst', s: '' });
  });

  it('a note becomes an artikel in place: the moment stays, the name goes with the artikel', () => {
    const note = deps.service.addEvent(lineId, { kind: 'note', name: 'De brief gevonden', text: 'in de la', at: MARCH_12 }, BRAM);
    const made = deps.createEntry({ typeSlug: 'event', name: 'De brief gevonden', createdBy: BRAM.id });
    const turned = deps.service.convertEventToEntry(note.id, made.id, BRAM);
    expect(turned.kind).toBe('entry');
    expect(turned.entry?.id).toBe(made.id);
    expect(turned.at).toBe(MARCH_12);
    expect(turned.text).toBe('in de la');
    const row = deps.sqlite.prepare('SELECT name FROM timeline_events WHERE id = ?').get(note.id) as { name: string };
    expect(row.name).toBe('');
    expect(() => deps.service.convertEventToEntry(note.id, made.id, BRAM)).toThrow(/al een artikel/);
  });

  it('says where an artikel is, only on tijdlijnen the reader may open', () => {
    const closed = deps.service.createTimeline({ name: 'Geheim', scale: 'day', isPrivate: true }, AAGJE);
    deps.service.addEvent(closed.id, { kind: 'entry', entryId: open, at: MARCH_12 }, AAGJE);
    const forBram = deps.service.listEventsForEntry(open, BRAM);
    expect(forBram.map((r) => r.timelineId)).toEqual([lineId]);
    expect(forBram[0].precision).toBe('month');
    const forAagje = deps.service.listEventsForEntry(open, AAGJE).map((r) => r.timelineId);
    expect(forAagje).toContain(closed.id);
    expect(forAagje).toContain(lineId);
  });

  it('"Genoemd in" lists the tijdlijn, behind the same rule', () => {
    const mentions = deps.listMentions(open, BRAM).filter((m) => m.kind === 'timeline');
    expect(mentions.map((m) => m.id)).toEqual([lineId]);
    expect(mentions[0].href).toBe('/timelines/de-zaak');
    const forAagje = deps.listMentions(open, AAGJE).filter((m) => m.kind === 'timeline').map((m) => m.id);
    expect(forAagje.length).toBe(2);
  });

  it('a card on a wall resolves the tijdlijn per viewer', () => {
    const closed = deps.service.listTimelines(AAGJE).find((t) => t.name === 'Geheim')!;
    const forBram = deps.resolveBoardTimelines([lineId, closed.id], BRAM);
    expect([...forBram.keys()]).toEqual([lineId]);
    expect(forBram.get(lineId)?.slug).toBe('de-zaak');
    expect(deps.resolveBoardTimelines([closed.id], AAGJE).get(closed.id)?.missing).toBe(false);
  });

  it('every write announces itself as a change to the tijdlijn', () => {
    expect(deps.keysOfStatement('insert into "timeline_events" ("id", "timeline_id", "kind", "entry_id") values (?, ?, ?, ?)', ['e1', 't1', 'entry', 'a1'])).toEqual(
      expect.arrayContaining(['timelines', 'event:e1', 'timeline:t1', 'entry:a1']),
    );
    expect(deps.keysOfStatement('update "timelines" set "name" = ? where "timelines"."id" = ?', ['x', 't1'])).toEqual(
      expect.arrayContaining(['timelines', 'timeline:t1']),
    );
    // §35: and so does a move — the gebeurtenis that was dragged, and the
    // artikel whose date it just rewrote.
    expect(
      deps.keysOfStatement('update "timeline_events" set "at" = ?, "updated_at" = ? where "timeline_events"."id" = ?', [1, 2, 'e1']),
    ).toEqual(expect.arrayContaining(['timelines', 'event:e1']));
    expect(
      deps.keysOfStatement('update "entries" set "fields" = ?, "updated_at" = ? where "entries"."id" = ?', ['{}', 2, 'a1']),
    ).toEqual(expect.arrayContaining(['entries', 'feed', 'entry:a1']));
  });
});

/**
 * §35: a gebeurtenis is dragged, and the artikel behind it moves with it.
 *
 *  1. Dragging an artikel gebeurtenis rewrites `entries.fields.date` and
 *     nothing else in that infobox — through `lib/timelines/moment.ts`, never
 *     `updateEntry`, so it is a move and not a proposal.
 *  2. Editing the artikel's date is the same fact from the other side: every
 *     gebeurtenis of it, on every tijdlijn, moves.
 *  3. The last drag wins: the same artikel on two tijdlijnen moves on both,
 *     each snapped to its own gebeurtenis's precision.
 *  4. An anchored tijdlijn fills a new gebeurtenis in and fences the axis.
 */
describe('dragging a gebeurtenis, and the artikel behind it', () => {
  const APRIL_2 = partsToSeconds({ year: 1931, month: 4, day: 2 });

  function fieldsOf(entryId: string): Record<string, unknown> {
    const row = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(entryId) as { fields: string };
    return JSON.parse(row.fields) as Record<string, unknown>;
  }

  it('writes the moment into the artikel\'s date, and touches nothing else in the infobox', () => {
    const line = deps.service.createTimeline({ name: 'De sleep', scale: 'day' }, BRAM);
    const art = deps.createEntry({
      typeSlug: 'event',
      name: 'De sleepboot',
      createdBy: BRAM.id,
      fields: { place: 'Vlissingen' },
    });
    const event = deps.service.addEvent(line.id, { kind: 'entry', entryId: art.id, at: MARCH_12, precision: 'day' }, BRAM);

    // Let go three days and twenty hours along: the nearest whole day is the 16th.
    const moved = deps.service.updateEvent(event.id, { at: MARCH_12 + 86400 * 3 + 3600 * 20 }, BRAM);
    expect(formatWhen(moved.at, moved.precision)).toBe('16 maart 1931');
    expect(fieldsOf(art.id)).toEqual({ place: 'Vlissingen', date: '16 maart 1931' });

    // A losse gebeurtenis has no artikel to write to, and writes to none.
    const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Mist', at: MARCH_12 }, BRAM);
    const nudged = deps.service.updateEvent(note.id, { at: MARCH_12 + 3600 * 20 }, BRAM);
    expect(formatWhen(nudged.at, nudged.precision)).toBe('13 maart 1931');
  });

  it('and the other way round: the artikel\'s date moves every gebeurtenis of it', () => {
    const line = deps.service.createTimeline({ name: 'Heen en terug', scale: 'day' }, BRAM);
    const art = deps.createEntry({ typeSlug: 'event', name: 'De terugweg', createdBy: BRAM.id });
    const event = deps.service.addEvent(line.id, { kind: 'entry', entryId: art.id, at: MARCH_12, precision: 'day' }, BRAM);

    const saved = deps.updateEntry(art.id, { fields: { date: '2 april 1931' } }, BRAM);
    expect(saved.status).toBe('saved');
    const after = deps.service.getEvent(event.id, BRAM)!;
    expect(after.at).toBe(APRIL_2);
    expect(after.precision).toBe('day');

    // A date nobody can read moves nothing.
    deps.updateEntry(art.id, { fields: { date: 'ergens in de zomer' } }, BRAM);
    expect(deps.service.getEvent(event.id, BRAM)!.at).toBe(APRIL_2);
  });

  it('the last drag wins: the same artikel on two tijdlijnen moves on both', () => {
    const days = deps.service.createTimeline({ name: 'De dagen', scale: 'day' }, BRAM);
    const years = deps.service.createTimeline({ name: 'De jaren', scale: 'year' }, BRAM);
    const art = deps.createEntry({ typeSlug: 'event', name: 'De vondst in twee lijnen', createdBy: BRAM.id });
    const onDays = deps.service.addEvent(days.id, { kind: 'entry', entryId: art.id, at: MARCH_12, precision: 'day' }, BRAM);
    const onYears = deps.service.addEvent(
      years.id,
      { kind: 'entry', entryId: art.id, at: partsToSeconds({ year: 1931 }), precision: 'year' },
      BRAM,
    );

    // Dragged on the tijdlijn of days, to 9 May 1932.
    deps.service.updateEvent(onDays.id, { at: partsToSeconds({ year: 1932, month: 5, day: 9 }) }, BRAM);
    expect(fieldsOf(art.id).date).toBe('9 mei 1932');
    // The tag on the tijdlijn of years went with it — snapped to its own
    // precision, which is a year: it does not learn a day it never knew.
    const year = deps.service.getEvent(onYears.id, BRAM)!;
    expect(year.at).toBe(partsToSeconds({ year: 1932 }));
    expect(formatWhen(year.at, year.precision)).toBe('1932');
    expect(deps.service.getEvent(onDays.id, BRAM)!.at).toBe(partsToSeconds({ year: 1932, month: 5, day: 9 }));
  });

  it('a tijdlijn that speelt op één dag: coarser than the measure, and nothing leaves the day', () => {
    const OCT_3 = partsToSeconds({ year: 1931, month: 10, day: 3 });
    const night = deps.service.createTimeline({ name: 'De nacht in het pakhuis', scale: 'minute' }, BRAM);
    expect(night.anchorAt).toBeNull();
    expect(night.anchorUnit).toBeNull();

    // Half an anchor is no anchor, and an hour is not a unit a tijdlijn plays on.
    expect(() => deps.service.updateTimeline(night.id, { anchorAt: OCT_3 }, BRAM)).toThrow(/tijdstip/);
    expect(() =>
      deps.service.updateTimeline(night.id, { anchorAt: OCT_3, anchorUnit: 'hour' as never }, BRAM),
    ).toThrow(/maat/);

    const anchored = deps.service.updateTimeline(night.id, { anchorAt: OCT_3, anchorUnit: 'day' }, BRAM);
    expect(anchored.anchorAt).toBe(OCT_3);
    expect(anchored.anchorUnit).toBe('day');

    // A tijdlijn measured in days cannot *be* one day.
    const plain = deps.service.createTimeline({ name: 'Gewone dagen', scale: 'day' }, BRAM);
    expect(() => deps.service.updateTimeline(plain.id, { anchorAt: OCT_3, anchorUnit: 'day' }, BRAM)).toThrow(/grover/);

    // Auto-fill: a moment from another century keeps only its time of day.
    const shot = deps.service.addEvent(
      night.id,
      { kind: 'note', name: 'Een schot', at: partsToSeconds({ year: 1887, month: 4, day: 19, hour: 23, minute: 5 }), precision: 'minute' },
      BRAM,
    );
    expect(formatWhen(shot.at, shot.precision)).toBe('3 oktober 1931, 23:05');

    // The fence: dragged three days along, it is still that night.
    const dragged = deps.service.updateEvent(shot.id, { at: OCT_3 + 86400 * 3 + 3600 * 22 + 60 * 30 }, BRAM);
    expect(formatWhen(dragged.at, dragged.precision)).toBe('3 oktober 1931, 22:30');

    // Made in one act, and taken away by a coarser measure.
    const made = deps.service.createTimeline({ name: 'Die avond', scale: 'minute', anchorAt: OCT_3, anchorUnit: 'day' }, BRAM);
    expect(made.anchorUnit).toBe('day');
    const remeasured = deps.service.updateTimeline(made.id, { scale: 'day' }, BRAM);
    expect(remeasured.anchorAt).toBeNull();
    expect(remeasured.anchorUnit).toBeNull();
  });
});

describe('the bin', () => {
  it('a tijdlijn goes in with its gebeurtenissen, comes back whole, and is destroyed with them alone', () => {
    const line = deps.service.createTimeline({ name: 'Weg ermee', scale: 'day' }, BRAM);
    const art = deps.createEntry({ typeSlug: 'event', name: 'Blijft bestaan', createdBy: BRAM.id });
    deps.service.addEvent(line.id, { kind: 'entry', entryId: art.id, at: MARCH_12 }, BRAM);
    deps.service.addEvent(line.id, { kind: 'note', name: 'Gaat mee', at: MARCH_12 }, BRAM);

    // Whoever may edit may bin it (the prikbord's rule); a stranger to a
    // tijdlijn whose edit dial is shut may not.
    deps.updateAccess('timeline', line.id, { editMode: 'private' }, BRAM);
    expect(() => deps.service.softDeleteTimeline(line.id, AAGJE)).toThrow(/niet verwijderen/);
    deps.service.softDeleteTimeline(line.id, BRAM);
    expect(deps.service.getTimelineById(line.id, KEEPER)).toBeUndefined();
    expect(deps.trash.listTrash().find((row) => row.kind === 'timeline' && row.id === line.id)?.href).toBe('/timelines/weg-ermee');

    deps.trash.restoreFromTrash('timeline', line.id, KEEPER.id);
    expect(deps.service.listEvents(line.id, KEEPER).length).toBe(2);

    deps.service.softDeleteTimeline(line.id, BRAM);
    expect(deps.trash.destroyEffects('timeline', line.id)).toEqual([{ label: 'gebeurtenissen erop', count: 2 }]);
    expect(deps.trash.destroyFromTrash('timeline', line.id, KEEPER.id)).toBe('Weg ermee');
    const events = deps.sqlite.prepare('SELECT count(*) AS n FROM timeline_events WHERE timeline_id = ?').get(line.id) as { n: number };
    expect(events.n).toBe(0);
    expect(deps.sqlite.prepare('SELECT count(*) AS n FROM entries WHERE id = ?').get(art.id)).toEqual({ n: 1 });
    expect(() => deps.trash.destroyFromTrash('timeline', line.id, KEEPER.id)).toThrow(/prullenbak/);
  });

  it('an artikel destroyed takes its gebeurtenissen; a dossier destroyed leaves its tijdlijnen loose', () => {
    const line = deps.service.createTimeline({ name: 'Bij de zaak', scale: 'day', caseId: 'c-open' }, BRAM);
    const art = deps.createEntry({ typeSlug: 'event', name: 'Vergaat', createdBy: BRAM.id });
    const ev = deps.service.addEvent(line.id, { kind: 'entry', entryId: art.id, at: MARCH_12 }, BRAM);
    deps.sqlite.prepare('UPDATE entries SET deleted_at = 1 WHERE id = ?').run(art.id);
    expect(deps.trash.destroyEffects('entry', art.id)).toEqual(expect.arrayContaining([{ label: 'gebeurtenissen op tijdlijnen', count: 1 }]));
    deps.trash.destroyFromTrash('entry', art.id, KEEPER.id);
    expect(deps.sqlite.prepare('SELECT count(*) AS n FROM timeline_events WHERE id = ?').get(ev.id)).toEqual({ n: 0 });

    deps.sqlite.prepare('UPDATE cases SET deleted_at = 1 WHERE id = ?').run('c-open');
    deps.trash.destroyFromTrash('case', 'c-open', KEEPER.id);
    expect(deps.service.getTimelineById(line.id, BRAM)?.caseId).toBeNull();
  });
});
