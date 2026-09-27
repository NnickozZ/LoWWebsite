import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitViewport, readableFit, readingFloor, READ_MIN_PX } from '@/lib/canvas/view';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX } from '@/lib/words';

/**
 * §99, ronde 60 — de vlakken, derde pas.
 *
 *   1. C7: an opening view is a readable fit (`readableFit`), and *Alles in
 *      beeld* (`fitViewport`) still shows everything, at a phone's size too;
 *   2. O8: migration 0037 gives a prikbord a description, a short box (§95)
 *      on the `cleanShort` road, with its readers;
 *   3. the rest, read off the source: the tekenlaag switch under the fold, the
 *      undo for editors only, the phone's hint row gone, the scale chips, the
 *      sticky button, the words by the `+`, and the words themselves.
 *
 * Asked of a real SQLite file where it is a question about SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-60-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k60', isKeeper: true };
const SPELER = { id: 's60', isKeeper: false };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  refs: typeof import('@/lib/entries/shortRefs');
  boards: typeof import('@/lib/boards/service');
  MIGRATIONS: typeof import('@/lib/db/migrations.mjs').MIGRATIONS;
};
let deps: Deps;

const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
const one = <T>(sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).get(...args) as T;
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    refs: await import('@/lib/entries/shortRefs'),
    boards: await import('@/lib/boards/service'),
    MIGRATIONS: (await import('@/lib/db/migrations.mjs')).MIGRATIONS,
  };
  for (const [id, name, keeper] of [
    ['k60', 'Keeper', 1],
    ['s60', 'Speler', 0],
  ] as const) {
    run(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`, id, name, name.toLowerCase(), keeper);
  }
  for (const [id, name, visibility] of [
    ['open60', 'Pier Boone', 'all'],
    ['geheim60', 'Het Geheim', 'keeper'],
  ] as const) {
    run(
      `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode, created_at)
       VALUES (?, 'character', ?, ?, '', '{}', '[]', ?, 'k60', 'all', 1000)`,
      id,
      name,
      id,
      visibility,
    );
  }
});

/* ------------------------------------------------------------ 1. C7 */

describe('C7: open leesbaar, Alles in beeld toont alles', () => {
  // A stamboom of five cards in one row, on a phone's glass.
  const bounds = { minX: 0, minY: 0, maxX: 5 * 200, maxY: 160 };
  const phone = { width: 358, height: 520 };
  const floor = readingFloor(14);

  it('opens no smaller than a name of ten pixels, from the start of the world', () => {
    const view = readableFit(bounds, phone, floor);
    expect(view.zoom * 14).toBeGreaterThanOrEqual(READ_MIN_PX - 0.01);
    // The first card is on the glass; the rest is a pan away.
    expect(view.x).toBeGreaterThan(0);
    expect(view.x).toBeLessThan(phone.width / 2);
  });

  it('keeps an explicit Alles in beeld at everything, even at five-pixel names', () => {
    const fit = fitViewport(bounds, phone);
    expect(fit.zoom).toBeLessThan(floor);
    expect(fit.x + bounds.maxX * fit.zoom).toBeLessThanOrEqual(phone.width);
  });

  it('is the same fit as Alles in beeld when everything is readable anyway', () => {
    const small = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
    expect(readableFit(small, phone, floor)).toEqual(fitViewport(small, phone));
  });

  it('is asked on opening by the prikbord and the stamboom, and nowhere by the fit button', () => {
    for (const path of ['components/boards/BoardCanvas.tsx', 'components/families/FamilyTreeCanvas.tsx']) {
      expect(source(path)).toMatch(/readableFit\(/);
    }
  });
});

/* ------------------------------------------------------------ 2. O8 */

describe('O8: een prikbord met een beschrijving', () => {
  it('is migration 0037, one column with a default, so an old backup still restores', () => {
    const migration = (deps.MIGRATIONS as { name: string; sql: string }[]).find((m) => m.name.startsWith('0037_'))!;
    expect(migration.name).toBe('0037_prikbord_beschrijving');
    expect(migration.sql).toMatch(/ALTER TABLE boards ADD COLUMN description TEXT NOT NULL DEFAULT ''/);
    // What `scripts/restore.mjs` does with a row from before 0037: only the
    // columns it has, and the rest is the default.
    run(`INSERT INTO boards (id, name, state) VALUES ('oud60', 'Oude muur', '{"cards":[],"strings":[]}')`);
    expect(one<{ description: string }>(`SELECT description FROM boards WHERE id = 'oud60'`).description).toBe('');
    expect(source('scripts/restore.mjs')).toMatch(/filter\(\(c\) => existing\.has\(c\)\)/);
  });

  it('saves through cleanShort: no handle to what the writer may not see', () => {
    const board = deps.boards.createBoard({ name: 'Wie kent wie', createdBy: 's60' });
    const open = deps.refs.mintHandle('open60', KEEPER)!;
    const secret = deps.refs.mintHandle('geheim60', KEEPER)!;
    const saved = deps.boards.setBoardDescription(board.id, `Rond ⟦${open}⟧ en ⟦${secret}⟧\u0007.`, SPELER);
    expect(saved).toContain(`⟦${open}⟧`);
    expect(saved).not.toContain(secret);
    expect(saved).not.toContain('\u0007');
    expect(deps.boards.getBoard(board.id, SPELER)?.description).toBe(saved);
    expect(deps.boards.listBoards(SPELER).find((b) => b.id === board.id)?.description).toBe(saved);
  });

  it('keeps the handle a player cannot see when they rewrite around it (§67)', () => {
    const board = deps.boards.createBoard({ name: 'Geheime muur', createdBy: 'k60' });
    const secret = deps.refs.mintHandle('geheim60', KEEPER)!;
    deps.boards.setBoardDescription(board.id, `Over ⟦${secret}⟧`, KEEPER);
    const after = deps.boards.setBoardDescription(board.id, 'Iets anders', SPELER);
    expect(after).toContain(`⟦${secret}⟧`);
    // And the player reads no name for it.
    expect(deps.refs.plainShort(SPELER, after ?? '')).toBe('Iets anders');
    expect(deps.refs.plainShort(KEEPER, after ?? '')).toContain('Het Geheim');
  });

  it('is capped, and a missing board is null', () => {
    const board = deps.boards.createBoard({ name: 'Lange muur', createdBy: 'k60' });
    expect(deps.boards.setBoardDescription(board.id, 'x'.repeat(5000), KEEPER)?.length).toBe(deps.boards.BOARD_DESCRIPTION_MAX);
    expect(deps.boards.setBoardDescription('nergens', 'x', KEEPER)).toBeNull();
  });

  it('has its readers: the heading, the shelf, the web, the API and the live pull', () => {
    const canvas = source('components/boards/BoardCanvas.tsx');
    expect(canvas).toMatch(/data-testid="board-description"/);
    expect(canvas).toMatch(/<ShortField[\s\S]{0,120}id="board-description-input"/);
    expect(source('app/(app)/boards/page.tsx')).toMatch(/board\.description/);
    expect(source('lib/web/service.ts')).toMatch(/plainShort\(viewer, board\.description\)/);
    expect(source('app/api/boards/[id]/route.ts')).toMatch(/setBoardDescription\(id, body\.description, user\)/);
    expect(source('components/boards/useBoardLive.ts')).toMatch(/onRenameRef\.current\(data\.name, data\.description\)/);
    // §101 naden: the kaartjes' texts ride along after it.
    expect(source('app/(app)/b/[id]/page.tsx')).toMatch(/shortChipsFor\(user, \[board\.description, \.\.\.board\.state\.cards/);
  });
});

/* ------------------------------------------------------------ 3. the rest */

describe('de rest, in de bron', () => {
  const canvas = () => source('components/boards/BoardCanvas.tsx');

  it('puts the Keeper\'s tekenlaag switch under the fold, not in the Rechten sheet', () => {
    expect(canvas()).toMatch(/<UnderFold slotId="board-ink-underfold">\{ink\.keeperControls\}<\/UnderFold>/);
    expect(canvas().match(/ink\.keeperControls/g)).toHaveLength(1);
    expect(source('app/(app)/b/[id]/page.tsx')).toMatch(/<div id="board-ink-underfold" \/>/);
  });

  it('gives the undo to every hand that may edit, grey in Lezen, on all four (C10)', () => {
    expect(canvas()).toMatch(/\{!locked && <CanvasUndoButton onUndo=\{undo\} canUndo=\{!handsOff && undoDepth > 0\} \/>\}/);
    expect(source('components/maps/MapCanvas.tsx')).toMatch(/mayType && <CanvasUndoButton[^\n]*canUndo=\{editing && undoDepth > 0\}/);
    expect(source('components/timelines/TimelineCanvas.tsx')).toMatch(/canEdit && <CanvasUndoButton[^\n]*canUndo=\{handsOn && undoDepth > 0\}/);
    expect(source('components/families/FamilyTreeCanvas.tsx')).toMatch(/canEdit && <CanvasUndoButton[^\n]*canUndo=\{editOn && undoDepth > 0\}/);
  });

  it('spends no row of a phone on the moving hint, and keeps the tool names (§64)', () => {
    expect(canvas()).not.toMatch(/<p className="board-hint">/);
    expect(canvas()).toMatch(/aria-label="Nieuwe notitie"/);
    expect(canvas()).toMatch(/aria-label=\{capitalise\(ui\.words\.pin\)\}/);
  });

  it('draws the scale of a new tijdlijn as chips, and keeps the event button on screen (C15)', () => {
    const maker = source('components/timelines/NewTimelineButton.tsx');
    expect(maker).toMatch(/timeline-scale-chip/);
    expect(maker).toMatch(/aria-label=\{SCALE_LABELS\[option\]\}/);
    expect(maker).toMatch(/sheet-actions-stick/);
    expect(source('components/timelines/EventSheets.tsx')).toMatch(/className="sheet-actions-stick new-event-actions">\s*<button[\s\S]{0,200}data-testid="new-event-submit"/);
  });

  it('gives the stamboom\'s last bare `+`s a word (C8)', () => {
    expect(source('components/families/TreeHandles.tsx')).toMatch(/tree-handle-worded tree-handle-both/);
    expect(source('components/families/FamilyTreeCanvas.tsx')).toMatch(/tree-tool-word tree-tool-word-keep/);
  });

  it('opens a stamboom no larger than 1, so a lone los kaartje keeps its handles on the glass', () => {
    const tree = source('components/families/FamilyTreeCanvas.tsx');
    expect(tree).toMatch(/const TREE_OPEN_MAX_ZOOM = 1;/);
    expect(tree).toMatch(/readableFit\(base\.bounds, size, TREE_READ_FLOOR, FIT_PADDING, TREE_OPEN_MAX_ZOOM\)/);
    // One card of 150 × 90 on a phone: the fit would blow it up; the opening does not.
    const card = { minX: 0, minY: 0, maxX: 150, maxY: 90 };
    const phone = { width: 358, height: 520 };
    expect(fitViewport(card, phone).zoom).toBeGreaterThan(1.5);
    expect(readableFit(card, phone, readingFloor(14), 48, 1).zoom).toBe(1);
  });

  it('has its words in one block, every one short enough to rewrite', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'Tekenvlakken: derde pas')!;
    expect(group.words.map((w) => w.key)).toEqual([
      'boardDescriptionLabel',
      'boardDescriptionPlaceholder',
      'boardDescriptionRefused',
      'treeHandleBoth',
    ]);
    for (const word of group.words) expect(DEFAULT_WORDS[word.key].length).toBeLessThanOrEqual(WORD_MAX);
    expect(source('lib/words.ts')).toMatch(/\/\/ §99 de vlakken, derde pas/);
  });
});
