import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §44, the audit's half: the three roads by which the Keeperkant leaked
 * *sideways* — not through a page that names a hidden thing, but through a
 * list, a filter or a settings panel that had never been told the flag exists.
 *
 * Each of the three is a real archive shape, not a contrived one:
 *
 *   1. **A dossier's Activiteit tab.** A twin keeps its source's dossier, so a
 *      Keeper-only prikbord or tijdlijn hangs in a dossier the table can open.
 *      The tab printed the wall's *name* ("Keeper maakte prikbord Wie het deed
 *      aan") and, for a tijdlijn, said one had been made where none appears.
 *   2. **The wiki's "op de kaart" filter.** Its subquery asked `maps` nothing
 *      but `deleted_at IS NULL`, so an artikel pinned on a Keeper-only
 *      landkaart came back — which says the landkaart is there.
 *   3. **`loadAccessRow` / the rechten panel.** The flag went into
 *      `viewableCondition` but not into the loader that `canView`, `canEdit`
 *      and `canManageAccess` are all fed from, so the *owner* of a wall the
 *      Keeper had since taken across still passed every in-memory check on it.
 *
 * All three are asked of a real SQLite file, because all three are questions
 * about SQL, and a mock would have answered whatever it was told.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-keeper-leaks-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listCaseActivity: typeof import('@/lib/cases/service').listCaseActivity;
  browseEntries: typeof import('@/lib/entries/service').browseEntries;
  loadAccessRow: typeof import('@/lib/access').loadAccessRow;
  canView: typeof import('@/lib/access').canView;
  viewerCanEdit: typeof import('@/lib/access').viewerCanEdit;
  canReview: typeof import('@/lib/entries/review').canReview;
  listPendingEdits: typeof import('@/lib/entries/review').listPendingEdits;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram owns the wall in test 3, and may open the dossier in test 1. */
const BRAM = { id: 'bram', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const cases = await import('@/lib/cases/service');
  const entries = await import('@/lib/entries/service');
  const access = await import('@/lib/access');
  const review = await import('@/lib/entries/review');
  deps = {
    canReview: review.canReview,
    listPendingEdits: review.listPendingEdits,
    sqlite: dbModule.sqlite,
    listCaseActivity: cases.listCaseActivity,
    browseEntries: entries.browseEntries,
    loadAccessRow: access.loadAccessRow,
    canView: access.canView,
    viewerCanEdit: access.viewerCanEdit,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const entry = (id: string, name: string) =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', 'all', 'keeper-1', 'all')`,
      id,
      name,
      id,
    );
  entry('e-jan', 'Jan Vermeer');
  entry('e-mien', 'Mien de Waal');

  /* 1 — one dossier everyone may open, with both faces of a wall in it. */
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-open', 'De verdwijning', 'c-open', 'keeper-1', 'all')`);
  run(
    `INSERT INTO boards (id, name, case_id, state, created_by, view_mode, keeper_only)
     VALUES ('b-open', 'Het bord van de spelers', 'c-open', '{"cards":[],"strings":[]}', 'keeper-1', 'all', 0)`,
  );
  run(
    `INSERT INTO boards (id, name, case_id, state, created_by, view_mode, keeper_only)
     VALUES ('b-dicht', 'Wie het werkelijk deed', 'c-open', '{"cards":[],"strings":[]}', 'keeper-1', 'all', 1)`,
  );
  run(
    `INSERT INTO timelines (id, name, slug, case_id, created_by, view_mode, keeper_only)
     VALUES ('t-dicht', 'De echte nacht', 't-dicht', 'c-open', 'keeper-1', 'all', 1)`,
  );
  const act = (id: string, verb: string, opts: { entryId?: string; boardId?: string; meta?: unknown } = {}) =>
    run(
      `INSERT INTO activity (id, actor_id, verb, entry_id, case_id, board_id, meta) VALUES (?, 'keeper-1', ?, ?, 'c-open', ?, ?)`,
      id,
      verb,
      opts.entryId ?? null,
      opts.boardId ?? null,
      JSON.stringify(opts.meta ?? {}),
    );
  act('a-open-board', 'board.created', { boardId: 'b-open' });
  act('a-dicht-board', 'board.created', { boardId: 'b-dicht' });
  act('a-dicht-timeline', 'timeline.created', { meta: { timelineId: 't-dicht', name: 'De echte nacht' } });
  // The artikel is one Bram may see; the tijdlijn it was put on is not.
  act('a-dicht-event', 'timeline.event_added', {
    entryId: 'e-jan',
    meta: { timelineId: 't-dicht', eventId: 'ev-1' },
  });
  act('a-plain', 'case.entry_added', { entryId: 'e-jan' });

  /* 2 — two landkaarten, one of them the Keeper's, one artikel pinned on each. */
  const map = (id: string, name: string, keeperOnly: number) =>
    run(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, keeper_only)
       VALUES (?, ?, ?, 'a1', 10, 10, 0, 'keeper-1', 'all', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  map('m-open', 'Het dorp', 0);
  map('m-dicht', 'De kelder', 1);
  run(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y) VALUES ('p-1', 'm-open', 'entry', 'e-mien', 0.5, 0.5)`);
  run(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y) VALUES ('p-2', 'm-dicht', 'entry', 'e-jan', 0.5, 0.5)`);

  /* 3 — a wall Bram made and the Keeper has since taken to their own side. */
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode, edit_mode, keeper_only)
     VALUES ('b-van-bram', 'Bram’s muur', '{"cards":[],"strings":[]}', 'bram', 'all', 'all', 1)`,
  );

  /*
   * 4 — an artikel Bram opened and the Keeper has since hidden, with a
   * proposal still waiting on it. Bram is its owner, which is what used to be
   * enough to read the queue and, with it, the fiche's current text.
   */
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-van-bram', 'character', 'De pastoor', 'e-van-bram', 'Wat hij die nacht zag', '{}', '[]', 'keeper', 'bram', 'all')`,
  );
  run(
    `INSERT INTO pending_edits (id, entry_id, proposed_snapshot, proposed_by, status)
     VALUES ('pe-1', 'e-van-bram', '{"shortDescription":"Iets anders"}', 'bram', 'pending')`,
  );
  // The same shape, still the table's: the check must narrow and nothing more.
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-bram-open', 'character', 'De schipper', 'e-bram-open', 'Nog gewoon te lezen', '{}', '[]', 'all', 'bram', 'all')`,
  );
});

describe('a dossier’s Activiteit tab names nothing on the Keeper’s side', () => {
  it('drops the row about a Keeper-only prikbord, and keeps the open one', () => {
    const forBram = deps.listCaseActivity('c-open', BRAM);
    const ids = forBram.map((row) => row.id);
    expect(ids).toContain('a-open-board');
    expect(ids).not.toContain('a-dicht-board');
    // Not merely unnamed: the wall's name must be nowhere in the answer.
    expect(JSON.stringify(forBram)).not.toContain('Wie het werkelijk deed');
  });

  it('drops the rows about a Keeper-only tijdlijn, named or not', () => {
    const ids = deps.listCaseActivity('c-open', BRAM).map((row) => row.id);
    // "maakte tijdlijn aan" carries no name, and gives the axis away anyway.
    expect(ids).not.toContain('a-dicht-timeline');
    // This one names an artikel Bram may see — the leak is the tijdlijn behind it.
    expect(ids).not.toContain('a-dicht-event');
  });

  it('leaves the Keeper the whole log, and everyone the rows about nothing hidden', () => {
    const ids = deps.listCaseActivity('c-open', KEEPER).map((row) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining(['a-open-board', 'a-dicht-board', 'a-dicht-timeline', 'a-dicht-event', 'a-plain']),
    );
    expect(deps.listCaseActivity('c-open', BRAM).map((row) => row.id)).toContain('a-plain');
  });
});

describe('“op de kaart” asks the landkaart’s own dial', () => {
  it('does not list an artikel that is only on a Keeper-only landkaart', () => {
    const names = deps.browseEntries(BRAM, { onMap: true }).map((row) => row.name);
    expect(names).toContain('Mien de Waal');
    expect(names).not.toContain('Jan Vermeer');
  });

  it('still lists both for a Keeper', () => {
    const names = deps.browseEntries(KEEPER, { onMap: true }).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['Mien de Waal', 'Jan Vermeer']));
  });
});

describe('the rechten row carries the Keeper’s side with it', () => {
  it('loadAccessRow reports keeper_only, so canView refuses the owner', () => {
    const row = deps.loadAccessRow('board', 'b-van-bram');
    expect(row?.keeperOnly).toBe(true);
    expect(row?.createdBy).toBe('bram');
    // Bram made this wall and its dials still say 'all' — only §44 shuts him out.
    expect(deps.canView(row!, BRAM)).toBe(false);
    expect(deps.canView(row!, KEEPER)).toBe(true);
  });

  it('and viewerCanEdit refuses it too', () => {
    expect(deps.viewerCanEdit('board', 'b-van-bram', BRAM)).toBe(false);
    expect(deps.viewerCanEdit('board', 'b-van-bram', KEEPER)).toBe(true);
  });

  it('an artikel has no such column and reads back exactly as before', () => {
    const row = deps.loadAccessRow('entry', 'e-jan');
    expect(row?.keeperOnly).toBeUndefined();
    expect(deps.canView(row!, BRAM)).toBe(true);
  });
});

describe('a voorstel queue is not a back door into a hidden artikel', () => {
  it('the owner of an artikel the Keeper has hidden may no longer review it', () => {
    expect(deps.canReview('e-van-bram', BRAM)).toBe(false);
    expect(deps.canReview('e-van-bram', KEEPER)).toBe(true);
    // What it would have handed over: the fiche's current words.
    const queue = deps.listPendingEdits('e-van-bram');
    expect(JSON.stringify(queue)).toContain('Wat hij die nacht zag');
  });

  it('an owner still reviews their own artikel while it is theirs to read', () => {
    expect(deps.canReview('e-bram-open', BRAM)).toBe(true);
    expect(deps.canReview('e-mien', BRAM)).toBe(false); // not Bram's
  });
});
