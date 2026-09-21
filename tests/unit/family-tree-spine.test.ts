import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §66: the spine of the stamboom — everything the archive has to know about a
 * fourth container kind *before* there is a service, an API or a canvas.
 *
 * The point of this file is that a kind is only added in one place if every
 * enumeration of kinds is added to at once. A stamboom that has a table but no
 * `sideCondition`, or a `keeperRef` but no live key, is a page that half exists
 * — and every half of it fails silently rather than loudly. So each of the
 * places a kind is spelled out is asked here, against a real SQLite file:
 *
 *   - the migration itself, on a fresh archive, with the columns §44/§43/§17
 *     all read off it;
 *   - the flat facts (`kindHref`) and the live key shapes;
 *   - `canWatch`, which is the one gate that decides whether a change signal
 *     may be heard at all — a signal for a hidden record says it exists;
 *   - `hideWhatHangsIn`, the third loop: hiding travels inwards (§48);
 *   - "Genoemd in", both halves — the write that reads the tree's own state,
 *     and the read that re-asks the tree's visibility rule for this viewer.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-stamboom-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  db: typeof import('@/lib/db').db;
  schema: typeof import('@/lib/db').schema;
  kindHref: typeof import('@/lib/keeper/kinds').kindHref;
  KEEPER_KINDS: typeof import('@/lib/keeper/kinds').KEEPER_KINDS;
  KIND_ICON: typeof import('@/lib/keeper/kinds').KIND_ICON;
  familyTreeKey: typeof import('@/lib/live/keys').familyTreeKey;
  parseRecordKey: typeof import('@/lib/live/keys').parseRecordKey;
  isWellFormedKey: typeof import('@/lib/live/keys').isWellFormedKey;
  COLLECTION_KEYS: typeof import('@/lib/live/keys').COLLECTION_KEYS;
  PAGE_PLACES: typeof import('@/lib/live/keys').PAGE_PLACES;
  canWatch: typeof import('@/lib/live/gate').canWatch;
  sideCondition: typeof import('@/lib/keeper/side').sideCondition;
  keeperRef: typeof import('@/lib/keeper/side').keeperRef;
  setKeeperSide: typeof import('@/lib/keeper/side').setKeeperSide;
  isKeeperSide: typeof import('@/lib/keeper/side').isKeeperSide;
  inkTarget: typeof import('@/lib/ink/service').inkTarget;
  inkTargetById: typeof import('@/lib/ink/service').inkTargetById;
  isInkKind: typeof import('@/lib/ink/types').isInkKind;
  recomputeFamilyTreeMentions: typeof import('@/lib/entries/mentions').recomputeFamilyTreeMentions;
  listMentions: typeof import('@/lib/entries/mentions').listMentions;
  MENTION_GROUPS: typeof import('@/lib/entries/mentions').MENTION_GROUPS;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

const emptyState = JSON.stringify({
  v: 1,
  members: [],
  loose: [],
  ties: [],
  deleted: { members: {}, loose: {}, ties: {} },
});

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const kinds = await import('@/lib/keeper/kinds');
  const keys = await import('@/lib/live/keys');
  const gate = await import('@/lib/live/gate');
  const side = await import('@/lib/keeper/side');
  const ink = await import('@/lib/ink/service');
  const inkTypes = await import('@/lib/ink/types');
  const mentions = await import('@/lib/entries/mentions');
  deps = {
    sqlite: dbModule.sqlite,
    db: dbModule.db,
    schema: dbModule.schema,
    kindHref: kinds.kindHref,
    KEEPER_KINDS: kinds.KEEPER_KINDS,
    KIND_ICON: kinds.KIND_ICON,
    familyTreeKey: keys.familyTreeKey,
    parseRecordKey: keys.parseRecordKey,
    isWellFormedKey: keys.isWellFormedKey,
    COLLECTION_KEYS: keys.COLLECTION_KEYS,
    PAGE_PLACES: keys.PAGE_PLACES,
    canWatch: gate.canWatch,
    sideCondition: side.sideCondition,
    keeperRef: side.keeperRef,
    setKeeperSide: side.setKeeperSide,
    isKeeperSide: side.isKeeperSide,
    inkTarget: ink.inkTarget,
    inkTargetById: ink.inkTargetById,
    isInkKind: inkTypes.isInkKind,
    recomputeFamilyTreeMentions: mentions.recomputeFamilyTreeMentions,
    listMentions: mentions.listMentions,
    MENTION_GROUPS: mentions.MENTION_GROUPS,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-jacob', 'character', 'Jacob den Hollander', 'jacob', '{}', '[]', 'all', 'keeper-1', 'all')`,
  );

  run(`INSERT INTO cases (id, name, slug, created_by) VALUES ('c-omslag', 'Het dossier', 'c-omslag', 'keeper-1')`);

  const tree = (id: string, name: string, opts: { keeperOnly?: number; caseId?: string | null; state?: string } = {}) =>
    run(
      `INSERT INTO family_trees (id, name, slug, state, created_by, view_mode, edit_mode, case_id, keeper_only)
       VALUES (?, ?, ?, ?, 'keeper-1', 'all', 'all', ?, ?)`,
      id,
      name,
      id,
      opts.state ?? emptyState,
      opts.caseId ?? null,
      opts.keeperOnly ?? 0,
    );

  tree('f-open', 'Den Hollander', {
    state: JSON.stringify({
      v: 1,
      members: [
        { id: 'e-jacob', updatedAt: 1 },
        // A member that was taken out again: a tombstone, not an absence (§61).
        { id: 'e-weg', updatedAt: 1 },
      ],
      loose: [{ id: 'l1', name: 'Onbekende vader', frame: 'unknown', updatedAt: 1 }],
      ties: [],
      deleted: { members: { 'e-weg': 2 }, loose: {}, ties: {} },
    }),
  });
  tree('f-dicht', 'Den Hollander — Keeper', { keeperOnly: 1, state: JSON.stringify({
    v: 1,
    members: [{ id: 'e-jacob', updatedAt: 1 }],
    loose: [],
    ties: [],
    deleted: { members: {}, loose: {}, ties: {} },
  }) });
  tree('f-in-omslag', 'De stamboom in het dossier', { caseId: 'c-omslag' });
  tree('f-prive', 'Alleen van de Keeper zelf', {});
  run(`UPDATE family_trees SET view_mode = 'private' WHERE id = 'f-prive'`);
  tree('f-weg', 'Uit de boom gehaald', {});
  run(`UPDATE family_trees SET deleted_at = 900 WHERE id = 'f-weg'`);
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('0023_family_trees applies on a fresh archive', () => {
  it('makes the table with every column the four dials need', () => {
    const columns = new Map(
      (deps.sqlite.prepare('PRAGMA table_info(family_trees)').all() as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }[]).map((row) => [row.name, row]),
    );
    for (const name of [
      'id',
      'name',
      'slug',
      'description',
      'case_id',
      'state',
      'view_mode',
      'edit_mode',
      'access_locked',
      'in_web',
      'keeper_only',
      'created_by',
      'created_at',
      'updated_at',
      'deleted_at',
    ]) {
      expect(columns.has(name), name).toBe(true);
    }
    // §44 and §43 are the two that decide whether a record is *there* at all,
    // so their defaults are the ones worth pinning: a new tree is the table's
    // and is in the web until somebody says otherwise.
    expect(columns.get('keeper_only')?.dflt_value).toBe('0');
    expect(columns.get('in_web')?.dflt_value).toBe('1');
    expect(columns.get('keeper_only')?.notnull).toBe(1);
    expect(columns.get('in_web')?.notnull).toBe(1);
  });

  it('gives the slug a unique index and the dossier a plain one', () => {
    const indexes = deps.sqlite.prepare('PRAGMA index_list(family_trees)').all() as {
      name: string;
      unique: number;
    }[];
    const bySlug = indexes.find((row) => row.name === 'family_trees_slug_idx');
    const byCase = indexes.find((row) => row.name === 'family_trees_case_idx');
    expect(bySlug?.unique).toBe(1);
    expect(byCase?.unique).toBe(0);
    expect(() =>
      deps.sqlite
        .prepare(
          `INSERT INTO family_trees (id, name, slug, state, created_at, updated_at) VALUES ('dubbel', 'x', 'f-open', '{}', 1, 1)`,
        )
        .run(),
    ).toThrow();
  });

  it('is recorded as applied, so it never runs twice', () => {
    const row = deps.sqlite
      .prepare(`SELECT name FROM schema_migrations WHERE name = '0023_family_trees'`)
      .get();
    expect(row).toEqual({ name: '0023_family_trees' });
  });
});

describe('the flat facts', () => {
  it('kindHref sends a stamboom to /stambomen/{slug}', () => {
    expect(deps.kindHref('family_tree', { id: 'f-1', slug: 'den-hollander' })).toBe(
      '/stambomen/den-hollander',
    );
    // No slug is the prikbord's fallback shape, not a broken address.
    expect(deps.kindHref('family_tree', { id: 'f-1' })).toBe('/stambomen/f-1');
  });

  it('is one of the kinds that has a Keeper side, and wears the tree icon', () => {
    expect(deps.KEEPER_KINDS).toContain('family_tree');
    expect(deps.KIND_ICON.family_tree).toBe('tree');
  });

  it('is a place ink can hang', () => {
    expect(deps.isInkKind('family_tree')).toBe(true);
  });
});

describe('the live keys', () => {
  it('names one tree, and reads its own name back', () => {
    expect(deps.familyTreeKey('f-open')).toBe('family_tree:f-open');
    expect(deps.parseRecordKey(deps.familyTreeKey('f-open'))).toEqual({
      kind: 'family_tree',
      id: 'f-open',
    });
    expect(deps.isWellFormedKey(deps.familyTreeKey('f-open'))).toBe(true);
  });

  it('has a collection and a place, or the list page could watch neither', () => {
    expect(deps.COLLECTION_KEYS as readonly string[]).toContain('family_trees');
    expect(deps.PAGE_PLACES as readonly string[]).toContain('/stambomen');
  });
});

describe('canWatch — a change signal is a fact about a record', () => {
  it('lets anyone hear about a tree they may open', () => {
    expect(deps.canWatch(deps.familyTreeKey('f-open'), BRAM)).toBe(true);
    expect(deps.canWatch(deps.familyTreeKey('f-open'), KEEPER)).toBe(true);
  });

  it('refuses the Keeper’s own to a player — the signal would say it exists', () => {
    expect(deps.canWatch(deps.familyTreeKey('f-dicht'), BRAM)).toBe(false);
    expect(deps.canWatch(deps.familyTreeKey('f-dicht'), KEEPER)).toBe(true);
  });

  it('refuses a private one to everybody but its owner and the Keepers (§17)', () => {
    expect(deps.canWatch(deps.familyTreeKey('f-prive'), BRAM)).toBe(false);
    expect(deps.canWatch(deps.familyTreeKey('f-prive'), KEEPER)).toBe(true);
  });

  it('refuses one that is in the bin, and one that never was', () => {
    expect(deps.canWatch(deps.familyTreeKey('f-weg'), KEEPER)).toBe(false);
    expect(deps.canWatch(deps.familyTreeKey('bestaat-niet'), KEEPER)).toBe(false);
    expect(deps.canWatch(deps.familyTreeKey('f-open'), null)).toBe(false);
  });

  it('and the tekenlaag on it follows whoever may see it', () => {
    expect(deps.inkTarget('family_tree', 'f-open', BRAM)?.name).toBe('Den Hollander');
    expect(deps.inkTarget('family_tree', 'f-dicht', BRAM)).toBeUndefined();
    expect(deps.inkTargetById('f-open', BRAM)?.kind).toBe('family_tree');
    expect(deps.canWatch(`ink:f-open`, BRAM)).toBe(true);
    expect(deps.canWatch(`ink:f-dicht`, BRAM)).toBe(false);
  });
});

describe('sideCondition — a list is read from one side', () => {
  const listNames = (viewer: Parameters<Deps['sideCondition']>[1]) => {
    // The condition on its own, run through drizzle exactly as the eleven list
    // functions AND it on after their visibility rule.
    const { db, schema } = deps;
    return db
      .select({ name: schema.familyTrees.name })
      .from(schema.familyTrees)
      .where(and(isNull(schema.familyTrees.deletedAt), deps.sideCondition('family_tree', viewer)))
      .all()
      .map((row) => row.name)
      .sort();
  };

  it('shows a Keeper on their own side only their own', () => {
    expect(listNames({ id: 'keeper-1', isKeeper: true, side: 'keeper' })).toEqual([
      'Den Hollander — Keeper',
    ]);
  });

  it('and on the players’ side only the table’s', () => {
    expect(listNames({ id: 'keeper-1', isKeeper: true, side: 'player' })).not.toContain(
      'Den Hollander — Keeper',
    );
  });

  it('a viewer with no side at all gets both — a test, an API, a room’s gate', () => {
    expect(listNames({ id: 'keeper-1', isKeeper: true })).toContain('Den Hollander — Keeper');
  });

  it('but a lookup never asks: keeperRef finds it from either side', () => {
    expect(deps.keeperRef('family_tree', 'f-dicht', { id: 'keeper-1', isKeeper: true, side: 'player' })?.id).toBe(
      'f-dicht',
    );
    // …and never for somebody who may not see it, whatever side they claim.
    expect(deps.keeperRef('family_tree', 'f-dicht', { id: 'bram', isKeeper: false, side: 'keeper' })).toBeNull();
  });
});

describe('§48 — hiding travels inwards, and takes the stamboom with it', () => {
  it('a dossier going to the Keeper’s side takes the tree hanging in it', () => {
    expect(deps.isKeeperSide('family_tree', 'f-in-omslag')).toBe(false);
    deps.setKeeperSide('case', 'c-omslag', true, 'keeper-1');
    expect(deps.isKeeperSide('family_tree', 'f-in-omslag')).toBe(true);
    expect(deps.keeperRef('family_tree', 'f-in-omslag', BRAM)).toBeNull();
  });

  it('and giving the dossier back does not hand the tree back', () => {
    deps.setKeeperSide('case', 'c-omslag', false, 'keeper-1');
    expect(deps.isKeeperSide('case', 'c-omslag')).toBe(false);
    expect(deps.isKeeperSide('family_tree', 'f-in-omslag')).toBe(true);
  });
});

describe('§27 — "Genoemd in" counts the people standing in a stamboom', () => {
  it('writes one row per member, and none for a tombstoned one', () => {
    deps.recomputeFamilyTreeMentions('f-open');
    const rows = deps.sqlite
      .prepare(`SELECT to_entry_id, detail FROM entry_mentions WHERE from_kind = 'family_tree' AND from_id = 'f-open'`)
      .all() as { to_entry_id: string; detail: string }[];
    // 'e-weg' is tombstoned in the state and was never an artikel anyway; the
    // detail is empty because a stamboom writes nothing of its own about a
    // person — the heading alone says where the mention is.
    expect(rows).toEqual([{ to_entry_id: 'e-jacob', detail: '' }]);
  });

  it('shows the tree to a reader who may open it', () => {
    const found = deps.listMentions('e-jacob', BRAM).filter((row) => row.kind === 'family_tree');
    expect(found).toEqual([
      { kind: 'family_tree', id: 'f-open', href: '/stambomen/f-open', name: 'Den Hollander', detail: '' },
    ]);
  });

  it('and never a Keeper-only one — that is the whole of §44 on this table', () => {
    deps.recomputeFamilyTreeMentions('f-dicht');
    const asPlayer = deps.listMentions('e-jacob', BRAM);
    expect(asPlayer.map((row) => row.id)).not.toContain('f-dicht');
    // Not merely unnamed: the tree's name must be nowhere in the answer.
    expect(JSON.stringify(asPlayer)).not.toContain('Keeper');

    const asKeeper = deps.listMentions('e-jacob', KEEPER).filter((row) => row.kind === 'family_tree');
    expect(asKeeper.map((row) => row.id).sort()).toEqual(['f-dicht', 'f-open']);
  });

  it('a tree kept out of the web is kept out of here too (round 18’s rule)', () => {
    deps.sqlite.prepare(`UPDATE family_trees SET in_web = 0 WHERE id = 'f-open'`).run();
    expect(deps.listMentions('e-jacob', BRAM).map((row) => row.id)).not.toContain('f-open');
    deps.sqlite.prepare(`UPDATE family_trees SET in_web = 1 WHERE id = 'f-open'`).run();
  });

  it('and it has a heading of its own, named from lib/words.ts', () => {
    const group = deps.MENTION_GROUPS.find((row) => row.key === 'family_tree');
    expect(group?.kinds).toEqual(['family_tree']);
    expect(group?.word).toBe('mentionedOnFamilyTrees');
    expect(group?.icon).toBe('tree');
  });
});
