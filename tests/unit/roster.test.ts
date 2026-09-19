import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §76: Aanwezig — the roster, asked from the other side.
 *
 * `lib/live/roster.ts` is the first thing in the archive that says a place
 * **out loud**. Everything before it only ever told you who was standing where
 * you already were, so there was nothing to gate. "Nick is op *Het dagboek van
 * Ysbrand*" is different: it asserts that the artikel exists, that it has that
 * name, and — since §44 — which side of the archive it lives on.
 *
 * So every assertion here is made from the side of the person who may **not**
 * see the thing, the way `tests/unit/access.test.ts` does it. And the heart of
 * it is not that a hidden place is hidden — it is that every hidden place is
 * hidden *identically*. A row that said "op een artikel" for one and "ergens
 * anders" for another would have named which hidden things exist without ever
 * printing a name; the constancy is the whole security property, which is why
 * the first test collects six unrelated kinds of hidden thing and asserts they
 * came back as one single answer.
 *
 * Asked of a real SQLite file, because every one of these questions is a
 * question about rights, and rights are SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-roster-'));
process.env.DATA_DIR = dir;

type Roster = typeof import('@/lib/live/roster');
type Hub = typeof import('@/lib/live/hub');
type Gate = typeof import('@/lib/live/gate');
type Wire = typeof import('@/lib/live/rosterWire');
type Words = typeof import('@/lib/admin/words');

let roster: Roster;
let hub: Hub;
let gate: Gate;
let wire: Wire;
let words: Words;
let sqlite: typeof import('@/lib/db').sqlite;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
/** Aagje is on the dossier and Bram is not. That is the whole of her job. */
const AAGJE = { id: 'aagje', isKeeper: false };

/* ------------------------------------------------------------- the windows */

/**
 * A window as `windowsNow` would have built it. `rosterFor` is exported whole
 * so the question the popover asks can be asked without a socket, which is how
 * every gating assertion below is made: no timers, no frames, no throttle.
 */
type Win = {
  key: string;
  userId: string;
  name: string;
  colour: string;
  place: string | null;
  places: Set<string>;
  verb: import('@/lib/live/rosterWire').RosterVerb;
  freshness: number;
  resting: boolean;
};

/**
 * §76: a row id is a hash of the account and the worn name, not the pair
 * itself — `hub.ts` keeps account ids off the wire, and a nudge is addressed
 * with this id, so it must not be guessable from somebody's name.
 */
const wid = (userId: string, name: string) => roster.windowId(userId, name);

function win(userId: string, name: string, place: string | null, over: Partial<Win> = {}): Win {
  return {
    key: wid(userId, name),
    userId,
    name,
    colour: '#8899aa',
    place,
    places: new Set(place ? [place] : []),
    verb: 'kijkt',
    freshness: 0,
    resting: false,
    ...over,
  };
}

let PEOPLE: Map<string, { username: string; isKeeper: boolean }>;

/** The roster as one viewer may see it, gated by the real `canWatch`. */
function ask(viewer: { id: string; isKeeper: boolean; windowKey?: string }, windows: Win[]) {
  return roster.rosterFor(
    viewer,
    windows,
    PEOPLE,
    (key) => gate.canWatch(key, { id: viewer.id, isKeeper: viewer.isKeeper }),
    Date.now(),
  );
}

/** What a row says about *where* — the only three fields §76 lets vary. */
const whereabouts = (row: { mode: string; label: string | null; href: string | null }) => ({
  mode: row.mode,
  label: row.label,
  href: row.href,
});

/* ----------------------------------------------------------------- the tabs */

type Frame = { event: string; data: unknown };

/** A pretend tab on the site line, as `tests/unit/live-site.test.ts` makes one. */
function tab(clientId: string, userId: string, name: string) {
  const inbox: Frame[] = [];
  const connection = hub.connect({
    id: `conn-${clientId}`,
    clientId,
    userId,
    name,
    send: (event) => inbox.push(event as Frame),
  });
  return {
    connection,
    inbox,
    of: (event: string) => inbox.filter((frame) => frame.event === event),
    clear: () => inbox.splice(0),
  };
}

/** The last roster this tab was handed. */
function rosterAt(t: ReturnType<typeof tab>) {
  t.clear();
  roster.publishRosterNow();
  const frames = t.of('roster');
  expect(frames.length).toBeGreaterThan(0);
  return frames[frames.length - 1].data as import('@/lib/live/rosterWire').RosterFrame;
}

const rowById = <T extends { id: string }>(frame: { rows: T[] }, id: string) =>
  frame.rows.find((row) => row.id === id);

/* ---------------------------------------------------------------- the world */

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  roster = await import('@/lib/live/roster');
  hub = await import('@/lib/live/hub');
  gate = await import('@/lib/live/gate');
  wire = await import('@/lib/live/rosterWire');
  words = await import('@/lib/admin/words');
  const ties = await import('@/lib/keeper/ties');

  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const entry = (id: string, name: string, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  entry('e-open', 'De veerman');
  // §9/§44: the Keeper's own artikel. The table may not know it is there.
  entry('e-geheim', 'Het complot', 'keeper');
  // §44: a real tweeling — the page the table wrote, and its far side.
  entry('e-wiki', 'De vuurtoren');
  entry('e-prep', 'De vuurtoren — Keeper', 'keeper');
  ties.linkTwin({ kind: 'entry', id: 'e-prep' }, { kind: 'entry', id: 'e-wiki' }, KEEPER.id);

  // §52: a prikbord with its view dial shut. Nobody but its maker and a Keeper.
  run(
    `INSERT INTO boards (id, name, state, view_mode, edit_mode, created_by) VALUES ('b-prive', 'Wie het deed', '{}', 'private', 'private', 'keeper-1')`,
  );
  // §17: a dossier Aagje was let into and Bram was not.
  run(
    `INSERT INTO cases (id, name, slug, created_by, view_mode, edit_mode) VALUES ('c-dossier', 'De verdwijning', 'de-verdwijning', 'keeper-1', 'some', 'some')`,
  );
  run(
    `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'c-dossier', 'aagje', 1, 0)`,
  );

  // The other kinds that are pages, for the labels.
  run(
    `INSERT INTO maps (id, name, slug, asset_id, created_by) VALUES ('m-eiland', 'Het eiland', 'het-eiland', 'a1', 'keeper-1')`,
  );
  run(
    `INSERT INTO timelines (id, name, slug, created_by) VALUES ('t-najaar', 'Het najaar', 'het-najaar', 'keeper-1')`,
  );
  run(
    `INSERT INTO family_trees (id, name, slug, state, created_by) VALUES ('f-hollander', 'Den Hollander', 'den-hollander', '{}', 'keeper-1')`,
  );
  run(
    `INSERT INTO overzichten (id, name, slug, created_by) VALUES ('o-start', 'Waar te beginnen', 'waar-te-beginnen', 'keeper-1')`,
  );
  // And two that are not pages: a speld and a gebeurtenis nobody can stand on.
  run(
    `INSERT INTO map_pins (id, map_id, kind, x, y, created_by) VALUES ('p-haven', 'm-eiland', 'note', 0.5, 0.5, 'keeper-1')`,
  );

  PEOPLE = new Map([
    ['keeper-1', { username: 'Keeper', isKeeper: true }],
    ['bram', { username: 'Bram', isKeeper: false }],
    ['aagje', { username: 'Aagje', isKeeper: false }],
  ]);
});

beforeEach(() => {
  hub.resetSiteHub();
  roster.resetRoster();
  roster.forgetPlaceLabels();
});

/* ============================================================ A. the leak */

describe('§76: a place is named per viewer, or not at all', () => {
  /**
   * Six unrelated hidden things, one answer. The *variation* is the leak: this
   * is the test that fails the day somebody makes the placeholder helpful.
   */
  const HIDDEN = [
    // A Keeper-only artikel (§9): saying "op een artikel" says one exists.
    'entry:e-geheim',
    // The far side of a §44 tweeling: the same artikel the table can already see.
    'entry:e-prep',
    // A prikbord whose view dial is shut (§17).
    'board:b-prive',
    // A dossier this viewer was not let into.
    'case:c-dossier',
    // An artikel that is not there at all.
    'entry:bestaat-niet',
    // Something that is not a key.
    'ergens/../anders',
    // §78: a kamer. Reserved, and `canWatch` refuses it.
    'room:k-eerste',
  ];

  it('tells a speler the same nothing about every kind of hidden place', () => {
    const rows = HIDDEN.map((place) => {
      const frame = ask(BRAM, [win('aagje', 'Nel', place)]);
      expect(frame.rows).toHaveLength(1);
      return frame.rows[0];
    });

    // One answer, whatever was behind it.
    const answers = new Set(rows.map((row) => JSON.stringify(whereabouts(row))));
    expect(answers.size).toBe(1);
    for (const row of rows) {
      expect(whereabouts(row)).toEqual({ mode: 'hidden', label: null, href: null });
    }
  });

  it('never leaks the place through anything else on the row either', () => {
    for (const place of HIDDEN) {
      const row = ask(BRAM, [win('aagje', 'Nel', place)]).rows[0];
      // The row is a person, not a whereabouts: nothing on it may be walked to.
      expect(row.href).toBeNull();
      expect(JSON.stringify(row)).not.toContain('e-geheim');
      expect(JSON.stringify(row)).not.toContain('e-prep');
      expect(JSON.stringify(row)).not.toContain('b-prive');
      expect(JSON.stringify(row)).not.toContain('c-dossier');
    }
  });

  it('and gives the same hidden row for a place that is nowhere at all', () => {
    const row = ask(BRAM, [win('aagje', 'Nel', null)]).rows[0];
    expect(whereabouts(row)).toEqual({ mode: 'hidden', label: null, href: null });
  });

  /** The control: the same places, asked by somebody who may. */
  it('names the very same places to whoever may see them', () => {
    const keeperSees = (place: string) => ask(KEEPER, [win('aagje', 'Nel', place)]).rows[0];
    expect(whereabouts(keeperSees('entry:e-geheim'))).toEqual({
      mode: 'place',
      label: 'Het complot',
      href: '/e/e-geheim',
    });
    expect(whereabouts(keeperSees('entry:e-prep'))).toEqual({
      mode: 'place',
      label: 'De vuurtoren — Keeper',
      href: '/e/e-prep',
    });
    expect(whereabouts(keeperSees('board:b-prive'))).toEqual({
      mode: 'place',
      label: 'Wie het deed',
      href: '/b/b-prive',
    });
    // And a player who was let into the dossier: the grant, not the Keeper flag.
    expect(whereabouts(ask(AAGJE, [win('bram', 'Van Dijk', 'case:c-dossier')]).rows[0])).toEqual({
      mode: 'place',
      label: 'De verdwijning',
      href: '/c/de-verdwijning',
    });
    expect(whereabouts(ask(BRAM, [win('bram', 'Van Dijk', 'case:c-dossier')]).rows[0])).toEqual({
      mode: 'hidden',
      label: null,
      href: null,
    });
    // The open half of the tweeling is the wiki's own, and stays named.
    expect(whereabouts(ask(BRAM, [win('aagje', 'Nel', 'entry:e-wiki')]).rows[0])).toEqual({
      mode: 'place',
      label: 'De vuurtoren',
      href: '/e/e-wiki',
    });
  });

  /**
   * The same publish, two accounts, two different frames. This is the test that
   * fails the day somebody takes the obvious optimisation — build one roster,
   * fan it out, let the browser hide what it may not see — which is precisely
   * the leak, and would not even be a bug anybody could see.
   */
  it('builds one frame per viewer out of a single publish', () => {
    const aagje = tab('t-per-a', 'aagje', 'Nel');
    const bram = tab('t-per-b', 'bram', 'Van Dijk');
    hub.setPlace(aagje.connection, 'case:c-dossier');
    aagje.clear();
    bram.clear();

    roster.publishRosterNow();
    const hers = (aagje.of('roster').pop()!.data as import('@/lib/live/rosterWire').RosterFrame).rows;
    const his = (bram.of('roster').pop()!.data as import('@/lib/live/rosterWire').RosterFrame).rows;

    expect(whereabouts(hers.find((row) => row.id === wid('aagje', 'Nel'))!)).toEqual({
      mode: 'place',
      label: 'De verdwijning',
      href: '/c/de-verdwijning',
    });
    expect(whereabouts(his.find((row) => row.id === wid('aagje', 'Nel'))!)).toEqual({
      mode: 'hidden',
      label: null,
      href: null,
    });
    // Both were told about her; only one was told where she is.
    expect(hers.map((row) => row.id).sort()).toEqual(his.map((row) => row.id).sort());
  });

  /**
   * §79 built the kamer, so `room:` is no longer a key the gate hard-wires to
   * false — it resolves one and asks `canSeeRoom`. What this case proves now is
   * the other half of that: a `room:` key naming a kamer that **does not
   * exist** is refused to everybody, the Keeper included. There is no kamer
   * `k-eerste` in this fixture, and a Keeper being above every dial is not a
   * reason to be told that something is there when nothing is. The gate's own
   * agreement with `canSeeRoom` for kamers that *do* exist is asserted in
   * `tests/unit/kamer.test.ts`, which has the table to ask.
   */
  it('refuses a room key for a kamer that does not exist — to everybody, Keeper included', () => {
    expect(gate.canWatch('room:k-eerste', KEEPER)).toBe(false);
    expect(whereabouts(ask(KEEPER, [win('bram', 'Van Dijk', 'room:k-eerste')]).rows[0])).toEqual({
      mode: 'hidden',
      label: null,
      href: null,
    });
  });
});

/* =========================================================== B. the Keeper */

describe('§76: the Keeper, seen by the table', () => {
  it('is here, and that is all a speler is told', () => {
    const row = ask(BRAM, [
      win('keeper-1', 'Keeper', 'entry:e-geheim', {
        places: new Set(['entry:e-geheim', 'board:b-prive', 'page:/admin']),
        verb: 'typt',
      }),
    ]).rows[0];
    expect(row.mode).toBe('quiet');
    expect(row.label).toBeNull();
    expect(row.href).toBeNull();
    // Not even how many places he is in: that count is the shape of the evening.
    expect(row.elsewhere).toBe(0);
    expect(row.verb).toBe('kijkt');
    expect(row.isKeeper).toBe(true);
  });

  it('is quiet even where he stands somewhere the speler may see', () => {
    // The place is `page:/wiki`, which Bram may watch. It is still not said.
    const row = ask(BRAM, [win('keeper-1', 'Keeper', 'page:/wiki')]).rows[0];
    expect(row.mode).toBe('quiet');
    expect(row.label).toBeNull();
  });

  it('resolves normally for another Keeper — two Keepers are one voice', () => {
    const row = ask(KEEPER, [win('keeper-1', 'Keeper', 'page:/wiki')]).rows[0];
    expect(row.mode).toBe('place');
    expect(row.label).toBe(words.getWords().navWiki);
    expect(row.href).toBe('/wiki');
  });

  it('a ghost Keeper is gone for the table and still there for a Keeper', () => {
    const windows = [win('keeper-1', 'Keeper', 'page:/wiki'), win('bram', 'Van Dijk', 'page:/wiki')];
    roster.setGhost(KEEPER, true);
    expect(roster.isGhost('keeper-1')).toBe(true);

    expect(ask(BRAM, windows).rows.map((row) => row.id)).toEqual([wid('bram', 'Van Dijk')]);
    const keeperRow = rowById(ask(KEEPER, windows), wid('keeper-1', 'Keeper'));
    expect(keeperRow?.ghost).toBe(true);
    expect(keeperRow?.mode).toBe('place');

    // And back: invisibility is memory, not a column.
    roster.setGhost(KEEPER, false);
    expect(ask(BRAM, windows).rows.map((row) => row.id)).toContain(wid('keeper-1', 'Keeper'));
    expect(rowById(ask(KEEPER, windows), wid('keeper-1', 'Keeper'))?.ghost).toBe(false);
  });

  it('a ghost Keeper is not in the tail either', () => {
    const watcher = tab('t-ghost-tail', 'bram', 'Van Dijk');
    const keeper = tab('t-ghost-k', 'keeper-1', 'Keeper');
    hub.setPlace(keeper.connection, 'page:/wiki');
    hub.disconnect(keeper.connection.id);
    expect(rosterAt(watcher).tail.map((row) => row.id)).toContain(wid('keeper-1', 'Keeper'));

    roster.setGhost(KEEPER, true);
    expect(rosterAt(watcher).tail.map((row) => row.id)).not.toContain(wid('keeper-1', 'Keeper'));
    // And a Keeper still sees it — another window, so the gone row is not his own.
    const asKeeper = tab('t-ghost-k2', 'keeper-1', 'Spelleider');
    expect(rosterAt(asKeeper).tail.map((row) => row.id)).toContain(wid('keeper-1', 'Keeper'));
  });

  it('a speler who asks to disappear does not', () => {
    const windows = [win('bram', 'Van Dijk', 'page:/wiki')];
    roster.setGhost(BRAM, true);
    expect(roster.isGhost('bram')).toBe(false);
    expect(ask(AAGJE, windows).rows.map((row) => row.id)).toEqual([wid('bram', 'Van Dijk')]);
    expect(ask(AAGJE, windows).rows[0].ghost).toBe(false);
    expect(ask(KEEPER, windows).rows[0].ghost).toBe(false);
  });
});

/* ========================================================== C. the windows */

describe('§18b: a row is a window, not an account', () => {
  it('three tabs on one karakter are one row, and the others are a number', () => {
    const a = tab('t-a', 'bram', 'Van Dijk');
    const b = tab('t-b', 'bram', 'Van Dijk');
    hub.setPlace(a.connection, 'page:/wiki');
    hub.setPlace(b.connection, 'page:/boards');

    const frame = rosterAt(a);
    const mine = frame.rows.filter((row) => row.account === 'Bram');
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(wid('bram', 'Van Dijk'));
    // Where the window is, and *how many* others — never which.
    expect(mine[0].elsewhere).toBe(1);
    expect(mine[0].mode).toBe('place');
  });

  it('two onderzoekers in two windows are two people at this table', () => {
    const a = tab('t-c', 'bram', 'Van Dijk');
    tab('t-d', 'bram', 'Nel');
    hub.setPlace(a.connection, 'page:/wiki');

    const frame = rosterAt(a);
    const mine = frame.rows.filter((row) => row.account === 'Bram');
    expect(mine.map((row) => row.id).sort()).toEqual([wid('bram', 'Nel'), wid('bram', 'Van Dijk')].sort());
    // One account behind both, and the karakter is the headline (§18, rule 5).
    expect(mine.every((row) => row.account === 'Bram')).toBe(true);
    expect(mine.map((row) => row.name).sort()).toEqual(['Nel', 'Van Dijk']);
    for (const row of mine) expect(row.elsewhere).toBe(0);
  });

  it('marks this viewer’s own window and nobody else’s', () => {
    const a = tab('t-e', 'bram', 'Van Dijk');
    const b = tab('t-f', 'aagje', 'Nel');
    hub.setPlace(a.connection, 'page:/wiki');
    hub.setPlace(b.connection, 'page:/wiki');

    expect(rosterAt(a).rows.filter((row) => row.self).map((row) => row.id)).toEqual([wid('bram', 'Van Dijk')]);
    expect(rosterAt(b).rows.filter((row) => row.self).map((row) => row.id)).toEqual([wid('aagje', 'Nel')]);
  });
});

/* ============================================================= D. the verbs */

describe('§76: the verb is read off the line, and decays', () => {
  it('is what the POST already carried, and nothing when it carried nothing', () => {
    expect(roster.verbOfPost({ updates: [{ k: 'name' }] })).toBe('typt');
    expect(roster.verbOfPost({ ink: [{ id: 's1' }] })).toBe('tekent');
    expect(roster.verbOfPost({ cursor: { m: { 'card-1': [0.5, 0.5] } } })).toBe('sleept');
    expect(roster.verbOfPost({})).toBeNull();
    // A hand that is carrying nothing is a hand, not a drag.
    expect(roster.verbOfPost({ cursor: { m: {} } })).toBeNull();
    expect(roster.verbOfPost({ updates: [], ink: [] })).toBeNull();
    expect(roster.verbOfPost({ updates: 'ja' as unknown as unknown[] })).toBeNull();
  });

  it('typing outranks nothing else on the same frame', () => {
    expect(roster.verbOfPost({ updates: [1], ink: [1], cursor: { m: { a: [0, 0] } } })).toBe('typt');
    expect(roster.verbOfPost({ ink: [1], cursor: { m: { a: [0, 0] } } })).toBe('tekent');
  });

  it('decays to kijkt, so a closed laptop is not still typing tomorrow', () => {
    expect(wire.verbNow('typt', 1_000, 1_000)).toBe('typt');
    expect(wire.verbNow('typt', 1_000, 1_000 + wire.VERB_DECAY_MS)).toBe('typt');
    expect(wire.verbNow('typt', 1_000, 1_000 + wire.VERB_DECAY_MS + 1)).toBe('kijkt');
    expect(wire.verbNow('sleept', 0, wire.VERB_DECAY_MS * 10)).toBe('kijkt');
    expect(wire.verbNow('kijkt', 0, 0)).toBe('kijkt');
  });

  it('a verb does not stick to a window on the roster either', () => {
    const a = tab('t-verb', 'bram', 'Van Dijk');
    hub.setPlace(a.connection, 'page:/wiki');

    roster.noteActivity('t-verb', 'tekent');
    expect(rowById(rosterAt(a), wid('bram', 'Van Dijk'))?.verb).toBe('tekent');

    // The same stroke, long enough ago.
    roster.noteActivity('t-verb', 'tekent', Date.now() - wire.VERB_DECAY_MS - 5_000);
    expect(rowById(rosterAt(a), wid('bram', 'Van Dijk'))?.verb).toBe('kijkt');

    // A heartbeat carrying nothing does not revive it.
    roster.noteActivity('t-verb', null);
    expect(rowById(rosterAt(a), wid('bram', 'Van Dijk'))?.verb).toBe('kijkt');
  });
});

/* ================================================== E. resting, and the tail */

describe('§60/§76: resting, leaving, and coming back', () => {
  it('a tab that gave its socket back is greyed, not gone', () => {
    const watcher = tab('t-watch', 'aagje', 'Nel');
    const sleeper = tab('t-sleep', 'bram', 'Van Dijk');
    hub.setPlace(sleeper.connection, 'page:/wiki');

    roster.markResting('t-sleep');
    hub.disconnect(sleeper.connection.id);

    const frame = rosterAt(watcher);
    const row = rowById(frame, wid('bram', 'Van Dijk'));
    expect(row?.resting).toBe(true);
    expect(frame.tail.map((t) => t.id)).not.toContain(wid('bram', 'Van Dijk'));
    // A resting window sorts below the awake ones.
    expect(frame.rows[frame.rows.length - 1].id).toBe(wid('bram', 'Van Dijk'));
  });

  it('a tab that simply left falls into the tail, which never carries a place', () => {
    const watcher = tab('t-watch2', 'aagje', 'Nel');
    const leaver = tab('t-leave', 'bram', 'Van Dijk');
    hub.setPlace(leaver.connection, 'entry:e-geheim');
    hub.disconnect(leaver.connection.id);

    const frame = rosterAt(watcher);
    expect(rowById(frame, wid('bram', 'Van Dijk'))).toBeUndefined();
    const gone = frame.tail.find((t) => t.id === wid('bram', 'Van Dijk'));
    expect(gone).toBeDefined();
    // The tail is stale by definition, so it has nothing to hide and says nothing.
    expect(Object.keys(gone!).sort()).toEqual(['account', 'at', 'colour', 'id', 'name', 'speler']);
    expect(gone!.speler).toBe('/spelers/bram');
    expect(JSON.stringify(gone)).not.toContain('e-geheim');
  });

  it('a window that comes back is in neither register', () => {
    const watcher = tab('t-watch3', 'aagje', 'Nel');
    const first = tab('t-back', 'bram', 'Van Dijk');
    hub.setPlace(first.connection, 'page:/wiki');
    hub.disconnect(first.connection.id);
    expect(rosterAt(watcher).tail.map((t) => t.id)).toContain(wid('bram', 'Van Dijk'));

    const again = tab('t-back-2', 'bram', 'Van Dijk');
    hub.setPlace(again.connection, 'page:/boards');
    const frame = rosterAt(watcher);
    expect(frame.tail.map((t) => t.id)).not.toContain(wid('bram', 'Van Dijk'));
    expect(rowById(frame, wid('bram', 'Van Dijk'))?.resting).toBe(false);

    // The same, from sleep rather than from the tail.
    roster.markResting('t-back-2');
    hub.disconnect(again.connection.id);
    expect(rowById(rosterAt(watcher), wid('bram', 'Van Dijk'))?.resting).toBe(true);
    const third = tab('t-back-3', 'bram', 'Van Dijk');
    hub.setPlace(third.connection, 'page:/wiki');
    expect(rowById(rosterAt(watcher), wid('bram', 'Van Dijk'))?.resting).toBe(false);
  });

  it('a resting window falls into the tail, and the tail forgets', () => {
    const base = Date.now();
    vi.useFakeTimers({ toFake: ['Date'], now: base });
    try {
      const watcher = tab('t-clock', 'aagje', 'Nel');
      const sleeper = tab('t-clock-2', 'bram', 'Van Dijk');
      hub.setPlace(sleeper.connection, 'page:/wiki');
      roster.markResting('t-clock-2');
      hub.disconnect(sleeper.connection.id);
      expect(rowById(rosterAt(watcher), wid('bram', 'Van Dijk'))?.resting).toBe(true);

      vi.setSystemTime(base + wire.REST_TO_TAIL_MS + 1_000);
      const fallen = rosterAt(watcher);
      expect(rowById(fallen, wid('bram', 'Van Dijk'))).toBeUndefined();
      expect(fallen.tail.map((t) => t.id)).toContain(wid('bram', 'Van Dijk'));

      // The tail measures from when they were last here, not from when they fell.
      vi.setSystemTime(base + wire.TAIL_MS + 1_000);
      expect(rosterAt(watcher).tail.map((t) => t.id)).not.toContain(wid('bram', 'Van Dijk'));
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ============================================================= F. the nudge */

describe('§76: a nudge is gated on the recipient', () => {
  it('is refused at a door the other person cannot open, and nothing is delivered', () => {
    const keeper = tab('t-n-k', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b', 'bram', 'Van Dijk');
    hub.setPlace(keeper.connection, 'entry:e-geheim');
    bram.clear();

    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'))).toBe('refused');
    expect(bram.of('nudge')).toHaveLength(0);
  });

  it('carries the label when the other person may follow it', () => {
    const keeper = tab('t-n-k2', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b2', 'bram', 'Van Dijk');
    hub.setPlace(keeper.connection, 'entry:e-geheim');
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'))).toBe('refused');

    // A refusal is not a drum beat: it does not spend the floor.
    hub.setPlace(keeper.connection, 'entry:e-open');
    bram.clear();
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'))).toBe('ok');
    const frames = bram.of('nudge');
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toMatchObject({ from: wid('keeper-1', 'Keeper'), name: 'Keeper', label: 'De veerman', href: '/e/e-open' });
  });

  it('nobody may drum on somebody else’s screen', () => {
    const keeper = tab('t-n-k3', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b3', 'bram', 'Van Dijk');
    hub.setPlace(keeper.connection, 'entry:e-open');
    const now = Date.now();
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'), now)).toBe('ok');
    bram.clear();
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'), now + wire.NUDGE_FLOOR_MS - 1)).toBe('soon');
    expect(bram.of('nudge')).toHaveLength(0);
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'), now + wire.NUDGE_FLOOR_MS + 1)).toBe('ok');
    expect(bram.of('nudge')).toHaveLength(1);
  });

  it('says so when there is no line, and when there is nowhere to come to', () => {
    const keeper = tab('t-n-k4', 'keeper-1', 'Keeper');
    hub.setPlace(keeper.connection, 'entry:e-open');
    // Aagje has no tab open.
    expect(roster.nudge(keeper.connection, wid('aagje', 'Nel'))).toBe('gone');

    const nowhere = tab('t-n-b4', 'bram', 'Van Dijk');
    expect(roster.nudge(nowhere.connection, wid('keeper-1', 'Keeper'))).toBe('nowhere');
    expect(keeper.of('nudge')).toHaveLength(0);
  });

  /**
   * §76: found in review, before this ever shipped.
   *
   * The roster hides an invisible Keeper, and `nudge` used to answer for him
   * anyway: `'ok'` for the one account the archive had just promised was not
   * there, `'gone'` for anybody genuinely offline. That is a one-click oracle
   * for exactly the thing invisibility exists to hide — and his screen lit up
   * with the invitation. He is absent, so he is absent to this too.
   */
  it('cannot be used to find an invisible Keeper', () => {
    const keeper = tab('t-n-k6', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b6', 'bram', 'Van Dijk');
    hub.setPlace(bram.connection, 'page:/wiki');
    roster.setGhost({ id: 'keeper-1', isKeeper: true }, true);
    keeper.clear();

    // The same answer an account with no line at all gets.
    expect(roster.nudge(bram.connection, wid('keeper-1', 'Keeper'))).toBe('gone');
    expect(keeper.of('nudge')).toHaveLength(0);

    // And with the door open again he is an ordinary neighbour.
    roster.setGhost({ id: 'keeper-1', isKeeper: true }, false);
    expect(roster.nudge(bram.connection, wid('keeper-1', 'Keeper'))).toBe('ok');
    expect(keeper.of('nudge')).toHaveLength(1);
  });

  /**
   * §76: a row id is a hash, and a nudge is addressed with it — so an account
   * id, which is what the browser used to send, now names nothing at all.
   */
  it('cannot be addressed to an account id', () => {
    const keeper = tab('t-n-k7', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b7', 'bram', 'Van Dijk');
    hub.setPlace(keeper.connection, 'entry:e-open');
    bram.clear();
    expect(roster.nudge(keeper.connection, 'bram')).toBe('gone');
    expect(bram.of('nudge')).toHaveLength(0);
  });

  it('is refused for a place that has no label at all', () => {
    const keeper = tab('t-n-k5', 'keeper-1', 'Keeper');
    const bram = tab('t-n-b5', 'bram', 'Van Dijk');
    // A collection key is watchable by anyone and is nowhere to stand.
    hub.setPlace(keeper.connection, 'entries');
    bram.clear();
    expect(roster.nudge(keeper.connection, wid('bram', 'Van Dijk'))).toBe('refused');
    expect(bram.of('nudge')).toHaveLength(0);
  });
});

/* ============================================================ G. the labels */

describe('§76: what a place is called, before anybody’s rights', () => {
  it('resolves every kind that is a page', () => {
    expect(roster.labelOfPlace('entry:e-open')).toEqual({ label: 'De veerman', href: '/e/e-open' });
    expect(roster.labelOfPlace('case:c-dossier')).toEqual({ label: 'De verdwijning', href: '/c/de-verdwijning' });
    expect(roster.labelOfPlace('board:b-prive')).toEqual({ label: 'Wie het deed', href: '/b/b-prive' });
    expect(roster.labelOfPlace('map:m-eiland')).toEqual({ label: 'Het eiland', href: '/maps/het-eiland' });
    expect(roster.labelOfPlace('timeline:t-najaar')).toEqual({ label: 'Het najaar', href: '/timelines/het-najaar' });
    expect(roster.labelOfPlace('family_tree:f-hollander')).toEqual({
      label: 'Den Hollander',
      href: '/stambomen/den-hollander',
    });
    expect(roster.labelOfPlace('overzicht:o-start')).toEqual({
      label: 'Waar te beginnen',
      href: '/wiki/overzicht/waar-te-beginnen',
    });
  });

  it('resolves the fixed pages, `page:/web` among them', () => {
    const w = words.getWords();
    // §76 found this one missing from PAGE_PLACES: nobody was ever seen on the web.
    expect(roster.labelOfPlace('page:/web')).toEqual({ label: w.navWeb, href: '/web' });
    expect(gate.canWatch('page:/web', BRAM)).toBe(true);
    expect(roster.labelOfPlace('page:/wiki')).toEqual({ label: w.navWiki, href: '/wiki' });
    expect(roster.labelOfPlace('page:/')).toEqual({ label: w.navHome, href: '/' });
    expect(roster.labelOfPlace('page:/wiki/overzicht/waar-te-beginnen')).toEqual({
      label: 'Waar te beginnen',
      href: '/wiki/overzicht/waar-te-beginnen',
    });
    // §77: a spelerspagina is named after the account, through the one slugger.
    expect(roster.labelOfPlace('page:/spelers/bram')).toEqual({
      label: `${w.spelerPage} — Bram`,
      href: '/spelers/bram',
    });
  });

  it('gives nothing for the kinds nobody stands on', () => {
    // A speld, a gebeurtenis, a tekenlaag and — §78 — a kamer.
    expect(roster.labelOfPlace('pin:p-haven')).toBeNull();
    expect(roster.labelOfPlace('event:ev-1')).toBeNull();
    expect(roster.labelOfPlace('ink:b-prive')).toBeNull();
    expect(roster.labelOfPlace('room:k-eerste')).toBeNull();
    // And nothing invented for what it cannot read.
    expect(roster.labelOfPlace('entry:bestaat-niet')).toBeNull();
    expect(roster.labelOfPlace('page:/etc/passwd')).toBeNull();
    expect(roster.labelOfPlace('page:/spelers/niemand')).toBeNull();
    expect(roster.labelOfPlace('ergens/../anders')).toBeNull();
  });

  it('remembers a name for a few seconds, and there is a road back', () => {
    expect(roster.labelOfPlace('entry:e-open')?.label).toBe('De veerman');
    sqlite.prepare(`UPDATE entries SET name = 'De veerman, hernoemd' WHERE id = 'e-open'`).run();
    // Stale, deliberately: a rename costs at most LABEL_TTL_MS on someone else's strip.
    expect(roster.labelOfPlace('entry:e-open')?.label).toBe('De veerman');
    roster.forgetPlaceLabels();
    expect(roster.labelOfPlace('entry:e-open')?.label).toBe('De veerman, hernoemd');
    sqlite.prepare(`UPDATE entries SET name = 'De veerman' WHERE id = 'e-open'`).run();
    roster.forgetPlaceLabels();
  });
});
