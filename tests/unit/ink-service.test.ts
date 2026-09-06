import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §33: the tekenlaag behind the archive's rules.
 *
 *  1. Drawing is for everyone who may *see* the thing — the one deliberate
 *     exception to "writers ask `viewerCanEdit`". A viewer the edit dial
 *     shuts out still draws and still rubs out; a viewer the *view* dial
 *     shuts out finds nothing there at all.
 *  2. The Keeper's switch: off means every stroke and every undo is refused,
 *     the strokes that are there stay, and only a Keeper flips it or wipes.
 *  3. The live side: the key is gated like the thing it hangs on, and a
 *     write to `ink_layers` moves `ink:{id}` and nothing else.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ink-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  ink: typeof import('@/lib/ink/service');
  boards: typeof import('@/lib/boards/service');
  timelines: typeof import('@/lib/timelines/service');
  maps: typeof import('@/lib/maps/service');
  updateAccess: typeof import('@/lib/access').updateAccess;
  canWatch: typeof import('@/lib/live/gate').canWatch;
  keysOfStatement: typeof import('@/lib/live/changes').keysOfStatement;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

const stroke = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  mode: 'ink',
  colour: 1,
  width: 4,
  points: [0, 0, 1, 5, 5, 1],
  ...extra,
});

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    ink: await import('@/lib/ink/service'),
    boards: await import('@/lib/boards/service'),
    timelines: await import('@/lib/timelines/service'),
    maps: await import('@/lib/maps/service'),
    updateAccess: (await import('@/lib/access')).updateAccess,
    canWatch: (await import('@/lib/live/gate')).canWatch,
    keysOfStatement: (await import('@/lib/live/changes')).keysOfStatement,
  };
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    deps.sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('who may draw', () => {
  it('a viewer without edit rights draws, and rubs out someone else\'s line', () => {
    const board = deps.boards.createBoard({ name: 'Kijkmuur', createdBy: BRAM.id });
    deps.updateAccess('board', board.id, { editMode: 'private' }, BRAM);

    const target = deps.ink.inkTarget('board', board.id, AAGJE);
    expect(target?.name).toBe('Kijkmuur');

    const drawn = deps.ink.applyInk(target!, { strokes: [stroke('a1')] }, AAGJE);
    expect(drawn.layer.strokes.map((s) => [s.id, s.by])).toEqual([['a1', 'aagje']]);

    const bramDraws = deps.ink.applyInk(deps.ink.inkTarget('board', board.id, BRAM)!, { strokes: [stroke('b1')] }, BRAM);
    expect(bramDraws.layer.strokes).toHaveLength(2);

    // Aagje's gum over Bram's line: a stroke, accepted from anyone who may look.
    const gum = deps.ink.applyInk(target!, { strokes: [stroke('a-gum', { mode: 'erase' })] }, AAGJE);
    expect(gum.layer.strokes.map((s) => s.id)).toEqual(['a1', 'b1', 'a-gum']);
  });

  it('a private prikbord has no tekenlaag for the person it is hidden from', () => {
    const board = deps.boards.createBoard({ name: 'Geheim', createdBy: BRAM.id, isPrivate: true });
    expect(deps.ink.inkTarget('board', board.id, AAGJE)).toBeUndefined();
    expect(deps.ink.inkTarget('board', board.id, BRAM)?.id).toBe(board.id);
    expect(deps.ink.inkTarget('board', board.id, KEEPER)?.id).toBe(board.id);
    expect(deps.canWatch(`ink:${board.id}`, AAGJE)).toBe(false);
    expect(deps.canWatch(`ink:${board.id}`, BRAM)).toBe(true);
  });

  it('a tijdlijn and a landkaart hang a layer the same way', () => {
    const line = deps.timelines.createTimeline({ name: 'De week', scale: 'day', isPrivate: true }, AAGJE);
    expect(deps.ink.inkTarget('timeline', line.id, BRAM)).toBeUndefined();
    expect(deps.ink.inkTargetById(line.id, AAGJE)?.kind).toBe('timeline');

    const map = deps.maps.createMap({ name: 'Walcheren', assetId: 'asset-1', width: 100, height: 100 }, KEEPER);
    expect(deps.ink.inkTargetById(map.id, BRAM)?.kind).toBe('map');
    expect(deps.ink.inkTargetById(map.id, null)).toBeUndefined();
    expect(deps.ink.inkTargetById('no-such-thing', KEEPER)).toBeUndefined();
  });
});

describe("the Keeper's switch", () => {
  it('only a Keeper flips it or wipes; off refuses every stroke and undo but keeps what is there', () => {
    const board = deps.boards.createBoard({ name: 'Schakelaar', createdBy: BRAM.id });
    const asBram = deps.ink.inkTarget('board', board.id, BRAM)!;
    const asKeeper = deps.ink.inkTarget('board', board.id, KEEPER)!;

    deps.ink.applyInk(asBram, { strokes: [stroke('b1')] }, BRAM);
    expect(() => deps.ink.applyInk(asBram, { enabled: false }, BRAM)).toThrow(/Keeper/);
    expect(() => deps.ink.applyInk(asBram, { clear: true }, BRAM)).toThrow(/Keeper/);

    const off = deps.ink.applyInk(asKeeper, { enabled: false }, KEEPER);
    expect(off.layer.enabled).toBe(false);
    expect(deps.ink.inkEnabled(board.id)).toBe(false);
    expect(deps.ink.getInk(board.id).strokes.map((s) => s.id)).toEqual(['b1']);

    let refused: unknown;
    try {
      deps.ink.applyInk(asBram, { strokes: [stroke('b2')] }, BRAM);
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(deps.ink.InkRefused);
    expect((refused as { status: number }).status).toBe(403);
    expect(() => deps.ink.applyInk(asBram, { undo: ['b1'] }, BRAM)).toThrow(/uit/);
    // Even the Keeper does not draw on a layer that is off — unless the same
    // patch turns it on.
    expect(() => deps.ink.applyInk(asKeeper, { strokes: [stroke('k1')] }, KEEPER)).toThrow(/uit/);
    const onAgain = deps.ink.applyInk(asKeeper, { enabled: true, strokes: [stroke('k1')] }, KEEPER);
    expect(onAgain.layer.enabled).toBe(true);
    expect(onAgain.layer.strokes.map((s) => s.id)).toEqual(['b1', 'k1']);

    const wiped = deps.ink.applyInk(asKeeper, { clear: true }, KEEPER);
    expect(wiped.layer.strokes).toEqual([]);
    expect(wiped.layer.clearedAt).not.toBeNull();

    const audit = deps.sqlite
      .prepare(`SELECT action, target_id FROM audit_log WHERE target_id = ? ORDER BY rowid`)
      .all(board.id) as { action: string }[];
    expect(audit.map((row) => row.action)).toEqual(['ink.disabled', 'ink.enabled', 'ink.cleared']);
  });

  it('a full layer answers 409', () => {
    const board = deps.boards.createBoard({ name: 'Vol', createdBy: BRAM.id });
    const target = deps.ink.inkTarget('board', board.id, BRAM)!;
    const many = Array.from({ length: 2000 }, (_, i) => stroke(`s${i}`));
    deps.ink.applyInk(target, { strokes: many }, BRAM);
    let status = 0;
    try {
      deps.ink.applyInk(target, { strokes: [stroke('extra')] }, BRAM);
    } catch (err) {
      status = (err as { status: number }).status;
    }
    expect(status).toBe(409);
    // A Keeper's wipe and a fresh stroke in one patch is fine.
    const after = deps.ink.applyInk(deps.ink.inkTarget('board', board.id, KEEPER)!, { clear: true, strokes: [stroke('extra')] }, KEEPER);
    expect(after.layer.strokes.map((s) => s.id)).toEqual(['extra']);
  });
});

describe('the live side', () => {
  it('a write to ink_layers moves ink:{id} and nothing else', () => {
    expect(
      deps.keysOfStatement(
        'insert into "ink_layers" ("target_id", "kind", "layer", "enabled", "updated_at") values (?, ?, ?, ?, ?) on conflict ("ink_layers"."target_id") do update set "layer" = ?, "enabled" = ?, "updated_at" = ?',
        ['b-1', 'board', '{}', 1, 0, '{}', 1, 0],
      ),
    ).toEqual(['ink:b-1']);
  });

  it('the key is gated like the thing it hangs on', () => {
    const line = deps.timelines.createTimeline({ name: 'Open lijn', scale: 'day' }, BRAM);
    expect(deps.canWatch(`ink:${line.id}`, AAGJE)).toBe(true);
    expect(deps.canWatch(`ink:${line.id}`, null)).toBe(false);
    expect(deps.canWatch('ink:nope', KEEPER)).toBe(false);
  });
});
