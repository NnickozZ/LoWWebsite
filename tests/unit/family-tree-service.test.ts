import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §66 — de stamboom, the archive's half, against a real SQLite file.
 *
 * Everything in here is a question about SQL or about a write that crosses two
 * tables, so none of it can be answered with a fake:
 *
 *   - §40: the dials exist on the day it is built — a private tree is invisible
 *     to anybody else, from the list *and* from its own address;
 *   - §46: a list filters by side, a lookup never does;
 *   - §48: filing into a Keeper-only dossier takes the tree along, and taking
 *     it out again does not hand it back;
 *   - §27: who stands in a tree is a mention of them;
 *   - and the two writes that leave the tree entirely: `writeRelation`, which
 *     goes through `updateEntry` so the mirror writes the other page, and
 *     `promoteLooseCard`, which turns a los kaartje's lines into fields.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-family-tree-'));
process.env.DATA_DIR = dir;

type Families = typeof import('@/lib/families/service');
type Deps = Families & {
  sqlite: typeof import('@/lib/db').sqlite;
  getEntrySummaryById: typeof import('@/lib/entries/service').getEntrySummaryById;
  setKeeperSide: typeof import('@/lib/keeper/side').setKeeperSide;
  isKeeperSide: typeof import('@/lib/keeper/side').isKeeperSide;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true } as const;
const OP_KEEPERKANT = { id: 'keeper-1', isKeeper: true, side: 'keeper' } as const;
const OP_SPELERSKANT = { id: 'keeper-1', isKeeper: true, side: 'player' } as const;
const BRAM = { id: 'bram', isKeeper: false } as const;
const NEL = { id: 'nel', isKeeper: false } as const;

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

/** The ids a koppelingsveld on this artikel is holding, whatever shape it is in. */
function refsOf(entryId: string, key: string): string[] {
  const raw = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(entryId) as { fields: string };
  const value = JSON.parse(raw.fields)[key];
  const one = (item: unknown) => (typeof item === 'string' ? item : (item as { id?: string })?.id);
  return (Array.isArray(value) ? value : value ? [value] : []).map(one).filter(Boolean) as string[];
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const families = await import('@/lib/families/service');
  const entries = await import('@/lib/entries/service');
  const side = await import('@/lib/keeper/side');
  deps = {
    ...families,
    sqlite: dbModule.sqlite,
    getEntrySummaryById: entries.getEntrySummaryById,
    setKeeperSide: side.setKeeperSide,
    isKeeperSide: side.isKeeperSide,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['nel', 'Nel', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const entry = (id: string, name: string, type = 'character') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, ?, ?, ?, '{}', '[]', 'all', 'keeper-1', 'all')`,
      id,
      type,
      name,
      id,
    );
  entry('e-pier', 'Pier Boone');
  entry('e-anna', 'Anna Boone');
  entry('e-kind', 'Jacob Boone');
  entry('e-huis', 'Het huis aan de dijk', 'location');

  run(`INSERT INTO cases (id, name, slug, created_by) VALUES ('c-open', 'De verdwijning', 'c-open', 'keeper-1')`);
  run(
    `INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES ('c-dicht', 'Wat er werkelijk gebeurde', 'c-dicht', 'keeper-1', 1)`,
  );
});

describe('maken, opzoeken en de plank', () => {
  it('a new stamboom gets a slug, and both roads find it again', () => {
    const tree = deps.createFamilyTree({ name: 'De familie Boone', description: 'Vier generaties.' }, KEEPER);
    expect(tree.slug).toBe('de-familie-boone');
    expect(tree.state.members).toEqual([]);
    expect(deps.getFamilyTreeById(tree.id, KEEPER)?.name).toBe('De familie Boone');
    expect(deps.getFamilyTreeBySlug('de-familie-boone', KEEPER)?.id).toBe(tree.id);
    expect(names(deps.listFamilyTrees(KEEPER))).toContain('De familie Boone');
  });

  it('a second tree of the same name gets a slug of its own', () => {
    const twice = deps.createFamilyTree({ name: 'De familie Boone' }, KEEPER);
    expect(twice.slug).toBe('de-familie-boone-2');
  });

  it('§17: a private tree is nobody else’s, in the list or at its own address', () => {
    const mine = deps.createFamilyTree({ name: 'Wat ik vermoed', isPrivate: true }, BRAM);
    expect(names(deps.listFamilyTrees(BRAM))).toContain('Wat ik vermoed');
    expect(names(deps.listFamilyTrees(NEL))).not.toContain('Wat ik vermoed');
    expect(deps.getFamilyTreeBySlug(mine.slug, NEL)).toBeUndefined();
    // A Keeper sees everything, as everywhere.
    expect(deps.getFamilyTreeBySlug(mine.slug, KEEPER)?.name).toBe('Wat ik vermoed');
  });

  it('§17: a tree in a dossier is behind that dossier’s view dial too', () => {
    const tree = deps.createFamilyTree({ name: 'In het geheime dossier', caseId: 'c-dicht' }, KEEPER);
    expect(deps.getFamilyTreeBySlug(tree.slug, BRAM)).toBeUndefined();
    expect(deps.listFamilyTreesForCase('c-dicht', BRAM)).toEqual([]);
    expect(names(deps.listFamilyTreesForCase('c-dicht', KEEPER))).toContain('In het geheime dossier');
  });

  it('§46: a list filters by side; a lookup never does', () => {
    const tree = deps.createFamilyTree({ name: 'De echte stamboom' }, KEEPER);
    deps.setKeeperSide('family_tree', tree.id, true, 'keeper-1');
    expect(names(deps.listFamilyTrees(OP_KEEPERKANT))).toEqual(['De echte stamboom']);
    expect(names(deps.listFamilyTrees(OP_SPELERSKANT))).not.toContain('De echte stamboom');
    // …but the page is there from either side.
    expect(deps.getFamilyTreeBySlug(tree.slug, OP_SPELERSKANT)?.name).toBe('De echte stamboom');
    expect(deps.getFamilyTreeById(tree.id, OP_SPELERSKANT)?.name).toBe('De echte stamboom');
    // And `bothSides` opts one list out again, for a picker.
    expect(names(deps.listFamilyTrees(OP_SPELERSKANT, { bothSides: true }))).toContain('De echte stamboom');
  });

  it('the shelf counts the people this viewer may see, not the tree’s length', () => {
    const tree = deps.createFamilyTree({ name: 'Wie er staan' }, KEEPER);
    deps.sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
         VALUES ('e-geheim', 'character', 'Het complot', 'e-geheim', '{}', '[]', 'keeper', 'keeper-1', 'all')`,
      )
      .run();
    deps.saveFamilyTreeState(
      tree.id,
      { members: [{ id: 'e-pier', updatedAt: 1 }, { id: 'e-geheim', updatedAt: 1 }] },
      KEEPER,
    );
    expect(deps.listFamilyTrees(KEEPER).find((row) => row.id === tree.id)?.memberCount).toBe(2);
    expect(deps.listFamilyTrees(BRAM).find((row) => row.id === tree.id)?.memberCount).toBe(1);
  });
});

describe('§48: het dossier neemt de stamboom mee', () => {
  it('filing into a Keeper-only dossier takes the tree along; unfiling does not hand it back', () => {
    const tree = deps.createFamilyTree({ name: 'Nog van niemand' }, KEEPER);
    expect(deps.isKeeperSide('family_tree', tree.id)).toBe(false);

    deps.setFamilyTreeCase(tree.id, 'c-dicht', KEEPER);
    expect(deps.getFamilyTreeById(tree.id, KEEPER)?.caseId).toBe('c-dicht');
    expect(deps.isKeeperSide('family_tree', tree.id)).toBe(true);

    // Hiding travels inwards, revealing never does.
    deps.setFamilyTreeCase(tree.id, null, KEEPER);
    expect(deps.isKeeperSide('family_tree', tree.id)).toBe(true);
  });

  it('filing into an open dossier leaves the side alone', () => {
    const tree = deps.createFamilyTree({ name: 'Gewoon een boom' }, KEEPER);
    deps.setFamilyTreeCase(tree.id, 'c-open', KEEPER);
    expect(deps.isKeeperSide('family_tree', tree.id)).toBe(false);
    expect(names(deps.listFamilyTreesForCase('c-open', KEEPER))).toContain('Gewoon een boom');
  });
});

describe('saveFamilyTreeState', () => {
  it('merges per item and writes the mentions', () => {
    const tree = deps.createFamilyTree({ name: 'De merge' }, KEEPER);
    const first = deps.saveFamilyTreeState(tree.id, { members: [{ id: 'e-pier', x: 10, y: 20, updatedAt: 100 }] }, KEEPER);
    expect(first.state.members).toHaveLength(1);
    expect(first.changed.members).toEqual(['e-pier']);

    // A second hand adds somebody else and never hears of the first — absence
    // is not a deletion.
    const second = deps.saveFamilyTreeState(tree.id, { members: [{ id: 'e-anna', updatedAt: 200 }] }, KEEPER);
    expect(second.state.members.map((m) => m.id).sort()).toEqual(['e-anna', 'e-pier']);
    expect(second.state.members.find((m) => m.id === 'e-pier')?.x).toBe(10);

    // §27: both are now named by this tree.
    const mentions = deps.sqlite
      .prepare(`SELECT to_entry_id AS id FROM entry_mentions WHERE from_kind = 'family_tree' AND from_id = ?`)
      .all(tree.id) as { id: string }[];
    expect(mentions.map((row) => row.id).sort()).toEqual(['e-anna', 'e-pier']);

    // A tombstone is a deletion, and it takes the mention with it.
    deps.saveFamilyTreeState(tree.id, { deletedMembers: ['e-anna'] }, KEEPER);
    const after = deps.sqlite
      .prepare(`SELECT to_entry_id AS id FROM entry_mentions WHERE from_kind = 'family_tree' AND from_id = ?`)
      .all(tree.id) as { id: string }[];
    expect(after.map((row) => row.id)).toEqual(['e-pier']);
  });

  it('a line between two artikelen is never stored in the tree', () => {
    const tree = deps.createFamilyTree({ name: 'Geen dubbele waarheid' }, KEEPER);
    const { state } = deps.saveFamilyTreeState(
      tree.id,
      {
        ties: [
          {
            id: 't-1',
            from: { kind: 'entry', id: 'e-pier' },
            to: { kind: 'entry', id: 'e-kind' },
            role: 'parent',
            updatedAt: 1,
          },
        ],
      },
      KEEPER,
    );
    expect(state.ties).toEqual([]);
  });
});

describe('writeRelation gaat door updateEntry heen', () => {
  it('§66: writing "Kinderen" on one page fills in "Ouders" on the other', () => {
    const result = deps.writeRelation('e-pier', 'kinderen', 'e-kind', true, KEEPER);
    expect(result.status).toBe('saved');
    expect(refsOf('e-pier', 'kinderen')).toEqual(['e-kind']);
    // The mirror, which only happens because this went through `updateEntry`.
    expect(refsOf('e-kind', 'ouders')).toEqual(['e-pier']);
  });

  it('removing mirrors too, and a line that is already gone is not a save', () => {
    expect(deps.writeRelation('e-pier', 'kinderen', 'e-kind', false, KEEPER).status).toBe('saved');
    expect(refsOf('e-pier', 'kinderen')).toEqual([]);
    expect(refsOf('e-kind', 'ouders')).toEqual([]);
    expect(deps.writeRelation('e-pier', 'kinderen', 'e-kind', false, KEEPER).status).toBe('unchanged');
  });

  it('a field without a role is not a line, and neither is a field the soort has not got', () => {
    expect(() => deps.writeRelation('e-pier', 'occupation', 'e-kind', true, KEEPER)).toThrow();
    expect(() => deps.writeRelation('e-pier', 'nergens', 'e-kind', true, KEEPER)).toThrow();
    expect(() => deps.writeRelation('e-pier', 'kinderen', 'e-pier', true, KEEPER)).toThrow();
  });

  it('a hand that may see the artikel but not change it files a voorstel', () => {
    deps.sqlite.prepare(`UPDATE entries SET edit_mode = 'private' WHERE id = 'e-anna'`).run();
    expect(deps.writeRelation('e-anna', 'kinderen', 'e-kind', true, BRAM).status).toBe('pending');
    expect(refsOf('e-anna', 'kinderen')).toEqual([]);
    deps.sqlite.prepare(`UPDATE entries SET edit_mode = 'all' WHERE id = 'e-anna'`).run();
  });
});

describe('promoteLooseCard', () => {
  it('turns the card into a member, its lines into fields, and buries the card', () => {
    const tree = deps.createFamilyTree({ name: 'Het losse kaartje' }, KEEPER);
    deps.saveFamilyTreeState(
      tree.id,
      {
        members: [{ id: 'e-kind', updatedAt: 1 }],
        loose: [{ id: 'l-vader', name: 'De vader van Jacob', frame: 'unknown', x: 40, y: 60, pinned: true, updatedAt: 1 }],
        ties: [
          {
            id: 't-vader',
            from: { kind: 'loose', id: 'l-vader' },
            to: { kind: 'entry', id: 'e-kind' },
            role: 'parent',
            updatedAt: 1,
          },
          {
            id: 't-buur',
            from: { kind: 'loose', id: 'l-vader' },
            to: { kind: 'loose', id: 'l-buur' },
            role: 'kin',
            updatedAt: 1,
          },
          { id: 'l-buur-self', from: { kind: 'loose', id: 'l-buur' }, to: { kind: 'entry', id: 'e-kind' }, role: 'kin', updatedAt: 1 },
        ],
      },
      KEEPER,
    );
    deps.saveFamilyTreeState(tree.id, { loose: [{ id: 'l-buur', name: 'De buurman', frame: 'unknown', updatedAt: 1 }] }, KEEPER);

    const { state, dropped } = deps.promoteLooseCard(tree.id, 'l-vader', 'e-pier', KEEPER);
    expect(dropped).toBe(0);

    // The card's place became the artikel's place.
    const member = state.members.find((one) => one.id === 'e-pier');
    expect(member).toMatchObject({ x: 40, y: 60, pinned: true });
    // And the card is gone.
    expect(state.loose.map((one) => one.id)).toEqual(['l-buur']);

    // The line to the artikel became a field — and the mirror wrote the other page.
    expect(refsOf('e-pier', 'kinderen')).toEqual(['e-kind']);
    expect(refsOf('e-kind', 'ouders')).toEqual(['e-pier']);
    expect(state.ties.find((one) => one.id === 't-vader')).toBeUndefined();

    // The line to the other loose card only changed its end.
    const rewritten = state.ties.find((one) => one.id === 't-buur');
    expect(rewritten?.from).toEqual({ kind: 'entry', id: 'e-pier' });
    expect(rewritten?.to).toEqual({ kind: 'loose', id: 'l-buur' });
  });

  it('a line neither soort has a field for is dropped, and counted', () => {
    const tree = deps.createFamilyTree({ name: 'Nergens te plaatsen' }, KEEPER);
    // `location` has no role fields at all, and `character` has no `kin` one.
    deps.saveFamilyTreeState(
      tree.id,
      {
        members: [{ id: 'e-huis', updatedAt: 1 }],
        loose: [{ id: 'l-iets', name: 'Iets', frame: 'unknown', updatedAt: 1 }],
        ties: [
          {
            id: 't-iets',
            from: { kind: 'loose', id: 'l-iets' },
            to: { kind: 'entry', id: 'e-huis' },
            role: 'kin',
            updatedAt: 1,
          },
        ],
      },
      KEEPER,
    );
    const { state, dropped } = deps.promoteLooseCard(tree.id, 'l-iets', 'e-anna', KEEPER);
    expect(dropped).toBe(1);
    expect(state.ties).toEqual([]);
    expect(state.members.map((one) => one.id).sort()).toEqual(['e-anna', 'e-huis']);
  });
});

describe('resolveFamilyTrees en visibleFamilyTreeIds', () => {
  it('name a tree only when this viewer may open it', () => {
    const open = deps.createFamilyTree({ name: 'Voor iedereen' }, KEEPER);
    const shut = deps.createFamilyTree({ name: 'Alleen voor Bram', isPrivate: true }, BRAM);
    const ids = [open.id, shut.id, 'bestaat-niet'];
    expect([...deps.resolveFamilyTrees(ids, NEL).keys()]).toEqual([open.id]);
    expect(deps.resolveFamilyTrees(ids, BRAM).get(shut.id)?.name).toBe('Alleen voor Bram');
    expect(deps.visibleFamilyTreeIds(ids, NEL)).toEqual(new Set([open.id]));
    expect(deps.resolveFamilyTrees([], NEL).size).toBe(0);
  });
});
