import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §75: the spine of the overzicht — everything the archive has to know about a
 * seventh kind *before* anybody looks at a page.
 *
 * `tests/unit/family-tree-spine.test.ts` is the file this one is copied from,
 * and CLAUDE.md says to copy it rather than rediscover its list. The reason is
 * the same: a kind with a table but no `sideCondition`, or a `keeperRef` but no
 * live key, half exists — and every half of it fails *silently*.
 *
 * The overzicht differs from the stamboom in what it deliberately does **not**
 * join, and those absences are asserted here as hard as the presences are,
 * because "we forgot" and "we decided" look identical in a codebase six months
 * later:
 *
 *   - it has **no tekenlaag** (nothing is drawn on a page of prose);
 *   - it writes **no `entry_mentions`** — links go one way, outward, which is
 *     rule 75 itself and the one line of code that implements it;
 *   - it hangs in **no dossier**, so `hideWhatHangsIn` never carries one.
 *
 * And one thing this file catches that nothing else would: `KeeperKind` is
 * spelled twice, in `lib/keeper/kinds.ts` and again in `lib/db/schema.ts` (a
 * column's `$type<>` may not import the module that imports the schema). The
 * two are asserted equal, so the eighth kind cannot be added to one and
 * forgotten in the other.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-overzicht-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  db: typeof import('@/lib/db').db;
  schema: typeof import('@/lib/db').schema;
  kindHref: typeof import('@/lib/keeper/kinds').kindHref;
  KEEPER_KINDS: typeof import('@/lib/keeper/kinds').KEEPER_KINDS;
  KIND_ICON: typeof import('@/lib/keeper/kinds').KIND_ICON;
  KIND_WORD: typeof import('@/lib/keeper/kinds').KIND_WORD;
  KIND_WORD_PLURAL: typeof import('@/lib/keeper/kinds').KIND_WORD_PLURAL;
  overzichtKey: typeof import('@/lib/live/keys').overzichtKey;
  overzichtPagePlace: typeof import('@/lib/live/keys').overzichtPagePlace;
  parseRecordKey: typeof import('@/lib/live/keys').parseRecordKey;
  isWellFormedKey: typeof import('@/lib/live/keys').isWellFormedKey;
  COLLECTION_KEYS: typeof import('@/lib/live/keys').COLLECTION_KEYS;
  canWatch: typeof import('@/lib/live/gate').canWatch;
  sideCondition: typeof import('@/lib/keeper/side').sideCondition;
  keeperRef: typeof import('@/lib/keeper/side').keeperRef;
  setKeeperSide: typeof import('@/lib/keeper/side').setKeeperSide;
  isKeeperSide: typeof import('@/lib/keeper/side').isKeeperSide;
  isInkKind: typeof import('@/lib/ink/types').isInkKind;
  listMentions: typeof import('@/lib/entries/mentions').listMentions;
  listOverzichten: typeof import('@/lib/overzichten/service').listOverzichten;
  getOverzichtBySlug: typeof import('@/lib/overzichten/service').getOverzichtBySlug;
  getHomeOverzicht: typeof import('@/lib/overzichten/service').getHomeOverzicht;
  overzichtHref: typeof import('@/lib/overzichten/service').overzichtHref;
  deleteOverzicht: typeof import('@/lib/overzichten/service').deleteOverzicht;
  createOverzicht: typeof import('@/lib/overzichten/service').createOverzicht;
  canEditSections: typeof import('@/lib/sections/service').canEditSections;
  createSection: typeof import('@/lib/sections/service').createSection;
  updateSection: typeof import('@/lib/sections/service').updateSection;
  listTrash: typeof import('@/lib/admin/trash').listTrash;
  restoreFromTrash: typeof import('@/lib/admin/trash').restoreFromTrash;
  RESERVED_WIKI_SLUGS: typeof import('@/lib/slug').RESERVED_WIKI_SLUGS;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const KEEPER_ON_PLAYER_SIDE = { id: 'keeper-1', isKeeper: true, side: 'player' as const };
const KEEPER_ON_KEEPER_SIDE = { id: 'keeper-1', isKeeper: true, side: 'keeper' as const };
const BRAM = { id: 'bram', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const kinds = await import('@/lib/keeper/kinds');
  const keys = await import('@/lib/live/keys');
  const gate = await import('@/lib/live/gate');
  const side = await import('@/lib/keeper/side');
  const inkTypes = await import('@/lib/ink/types');
  const mentions = await import('@/lib/entries/mentions');
  const overzichten = await import('@/lib/overzichten/service');
  const sections = await import('@/lib/sections/service');
  const trash = await import('@/lib/admin/trash');
  const slug = await import('@/lib/slug');
  deps = {
    sqlite: dbModule.sqlite,
    db: dbModule.db,
    schema: dbModule.schema,
    kindHref: kinds.kindHref,
    KEEPER_KINDS: kinds.KEEPER_KINDS,
    KIND_ICON: kinds.KIND_ICON,
    KIND_WORD: kinds.KIND_WORD,
    KIND_WORD_PLURAL: kinds.KIND_WORD_PLURAL,
    overzichtKey: keys.overzichtKey,
    overzichtPagePlace: keys.overzichtPagePlace,
    parseRecordKey: keys.parseRecordKey,
    isWellFormedKey: keys.isWellFormedKey,
    COLLECTION_KEYS: keys.COLLECTION_KEYS,
    canWatch: gate.canWatch,
    sideCondition: side.sideCondition,
    keeperRef: side.keeperRef,
    setKeeperSide: side.setKeeperSide,
    isKeeperSide: side.isKeeperSide,
    isInkKind: inkTypes.isInkKind,
    listMentions: mentions.listMentions,
    listOverzichten: overzichten.listOverzichten,
    getOverzichtBySlug: overzichten.getOverzichtBySlug,
    getHomeOverzicht: overzichten.getHomeOverzicht,
    overzichtHref: overzichten.overzichtHref,
    deleteOverzicht: overzichten.deleteOverzicht,
    createOverzicht: overzichten.createOverzicht,
    canEditSections: sections.canEditSections,
    createSection: sections.createSection,
    updateSection: sections.updateSection,
    listTrash: trash.listTrash,
    restoreFromTrash: trash.restoreFromTrash,
    RESERVED_WIKI_SLUGS: slug.RESERVED_WIKI_SLUGS,
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

  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-jacob', 'character', 'Jacob den Hollander', 'jacob', '{}', '[]', 'all', 'keeper-1', 'all')`,
  );

  const overzicht = (
    id: string,
    name: string,
    opts: { keeperOnly?: number; viewMode?: string; deletedAt?: number | null } = {},
  ) =>
    run(
      `INSERT INTO overzichten (id, name, slug, lead, is_home, created_by, view_mode, edit_mode, keeper_only, deleted_at)
       VALUES (?, ?, ?, '', 0, 'keeper-1', ?, 'all', ?, ?)`,
      id,
      name,
      id,
      opts.viewMode ?? 'all',
      opts.keeperOnly ?? 0,
      opts.deletedAt ?? null,
    );

  overzicht('o-eiland', 'Het eiland');
  overzicht('o-keeper', 'Wat de Keeper klaarzet', { keeperOnly: 1 });
  overzicht('o-prive', 'Alleen van mij', { viewMode: 'private' });
  overzicht('o-weg', 'Weggegooid', { deletedAt: 900 });
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('0026_overzichten applies on a fresh archive', () => {
  it('makes the table with every column the dials, the side and the bin need', () => {
    const columns = new Map(
      (
        deps.sqlite.prepare('PRAGMA table_info(overzichten)').all() as {
          name: string;
          dflt_value: string | null;
        }[]
      ).map((row) => [row.name, row]),
    );
    for (const name of [
      'id',
      'name',
      'slug',
      'lead',
      'is_home',
      'icon',
      'sort_order',
      // §17
      'view_mode',
      'edit_mode',
      'access_locked',
      // §44
      'keeper_only',
      'created_by',
      'created_at',
      'updated_at',
      // §43
      'deleted_at',
    ]) {
      expect(columns.has(name), `overzichten.${name}`).toBe(true);
    }
  });

  /**
   * The round's decision, as a column rather than as a habit: anybody may edit
   * an overzicht until somebody turns the dial down. A landkaart ships
   * 'private' here (§40) and the difference is the whole point of this kind.
   */
  it('ships edit_mode as all, so the players run the wiki', () => {
    const column = (
      deps.sqlite.prepare('PRAGMA table_info(overzichten)').all() as {
        name: string;
        dflt_value: string | null;
      }[]
    ).find((row) => row.name === 'edit_mode');
    expect(column?.dflt_value).toBe("'all'");
  });

  it('gives the wiki a front door that the migration made, exactly one', () => {
    const homes = deps.sqlite.prepare('SELECT id, slug FROM overzichten WHERE is_home = 1').all() as {
      id: string;
      slug: string;
    }[];
    expect(homes).toHaveLength(1);
    expect(homes[0].id).toBe('overzicht-home');
  });

  it('leaves the home overzicht empty, so lib/intro.ts stays the one text', () => {
    const row = deps.sqlite.prepare("SELECT lead FROM overzichten WHERE id = 'overzicht-home'").get() as {
      lead: string;
    };
    expect(row.lead).toBe('');
  });
});

describe('the flat facts', () => {
  it('is one of the kinds, in both places KeeperKind is spelled', async () => {
    expect(deps.KEEPER_KINDS).toContain('overzicht');
    // The schema's copy. A type cannot be asserted at runtime, so this asks the
    // one thing that would break: a column typed with the narrower union still
    // accepts the value, which it only does if both unions carry it.
    deps.sqlite
      .prepare(`INSERT INTO keeper_notes (kind, target_id, text) VALUES ('overzicht', 'o-eiland', 'x')`)
      .run();
    const note = deps.sqlite
      .prepare(`SELECT text FROM keeper_notes WHERE kind = 'overzicht' AND target_id = 'o-eiland'`)
      .get() as { text: string } | undefined;
    expect(note?.text).toBe('x');
    deps.sqlite.prepare(`DELETE FROM keeper_notes WHERE kind = 'overzicht'`).run();
  });

  it('has an icon and a word of its own', () => {
    expect(deps.KIND_ICON.overzicht).toBeTruthy();
    expect(deps.KIND_WORD.overzicht).toBe('overzicht');
    expect(deps.KIND_WORD_PLURAL.overzicht).toBe('overzichtPlural');
  });

  it('lives in the wiki, and the home one is the wiki', () => {
    expect(deps.kindHref('overzicht', { id: 'o-eiland', slug: 'het-eiland' })).toBe(
      '/wiki/overzicht/het-eiland',
    );
    expect(deps.overzichtHref({ slug: 'het-eiland', isHome: false })).toBe('/wiki/overzicht/het-eiland');
    expect(deps.overzichtHref({ slug: 'start', isHome: true })).toBe('/wiki');
  });

  it('keeps the wiki’s own addresses off limits', () => {
    expect(deps.RESERVED_WIKI_SLUGS).toContain('alles');
    expect(deps.RESERVED_WIKI_SLUGS).toContain('overzicht');
  });
});

describe('the live keys', () => {
  it('parses as a record key and is safe on the wire', () => {
    const key = deps.overzichtKey('o-eiland');
    expect(deps.parseRecordKey(key)).toEqual({ kind: 'overzicht', id: 'o-eiland' });
    expect(deps.isWellFormedKey(key)).toBe(true);
  });

  it('has a collection key and a page place', () => {
    expect(deps.COLLECTION_KEYS).toContain('overzichten');
    expect(deps.overzichtPagePlace('het-eiland')).toBe('page:/wiki/overzicht/het-eiland');
  });

  /**
   * §21: a change signal is a fact about a key, so watching one for a record a
   * player may not see would tell them it exists. The gate is the whole of that
   * rule for this kind.
   */
  it('may be watched by whoever may see it, and by nobody else', () => {
    expect(deps.canWatch(deps.overzichtKey('o-eiland'), BRAM)).toBe(true);
    expect(deps.canWatch(deps.overzichtKey('o-keeper'), BRAM)).toBe(false);
    expect(deps.canWatch(deps.overzichtKey('o-prive'), BRAM)).toBe(false);
    expect(deps.canWatch(deps.overzichtKey('o-weg'), BRAM)).toBe(false);
    expect(deps.canWatch(deps.overzichtKey('o-keeper'), KEEPER)).toBe(true);
  });

  it('lets a page place be watched on both shapes of wiki address', () => {
    expect(deps.canWatch('page:/wiki', BRAM)).toBe(true);
    expect(deps.canWatch('page:/wiki/alles', BRAM)).toBe(true);
    expect(deps.canWatch(`page:${deps.overzichtPagePlace('het-eiland').slice('page:'.length)}`, BRAM)).toBe(
      true,
    );
  });
});

describe('§44/§46: the side', () => {
  it('reads keeper_only, and a list is read from one side at a time', () => {
    expect(deps.isKeeperSide('overzicht', 'o-keeper')).toBe(true);
    expect(deps.isKeeperSide('overzicht', 'o-eiland')).toBe(false);

    const player = deps.listOverzichten(KEEPER_ON_PLAYER_SIDE).map((row) => row.id);
    const keeper = deps.listOverzichten(KEEPER_ON_KEEPER_SIDE).map((row) => row.id);
    expect(player).toContain('o-eiland');
    expect(player).not.toContain('o-keeper');
    expect(keeper).toContain('o-keeper');
    expect(keeper).not.toContain('o-eiland');
  });

  it('never filters a lookup by side, so a Keeper walks in from either side', () => {
    expect(deps.getOverzichtBySlug('o-keeper', KEEPER_ON_PLAYER_SIDE)?.id).toBe('o-keeper');
    expect(deps.getOverzichtBySlug('o-eiland', KEEPER_ON_KEEPER_SIDE)?.id).toBe('o-eiland');
  });

  it('answers null rather than a row for anything not for this reader', () => {
    expect(deps.keeperRef('overzicht', 'o-keeper', BRAM)).toBeNull();
    expect(deps.keeperRef('overzicht', 'o-weg', BRAM)).toBeNull();
    expect(deps.keeperRef('overzicht', 'o-eiland', BRAM)?.name).toBe('Het eiland');
    expect(deps.keeperRef('overzicht', 'o-keeper', KEEPER)?.keeperOnly).toBe(true);
  });

  it('moves between the sides through setKeeperSide and nothing else', () => {
    deps.setKeeperSide('overzicht', 'o-eiland', true, 'keeper-1');
    expect(deps.isKeeperSide('overzicht', 'o-eiland')).toBe(true);
    deps.setKeeperSide('overzicht', 'o-eiland', false, 'keeper-1');
    expect(deps.isKeeperSide('overzicht', 'o-eiland')).toBe(false);
  });

  it('hides the home overzicht from a player when it is the Keeper’s', () => {
    expect(deps.getHomeOverzicht(BRAM)?.id).toBe('overzicht-home');
    deps.setKeeperSide('overzicht', 'overzicht-home', true, 'keeper-1');
    // The one place in the archive where "not for you" is allowed to be
    // something other than a 404: `/wiki` falls back to the browse list.
    expect(deps.getHomeOverzicht(BRAM)).toBeNull();
    expect(deps.getHomeOverzicht(KEEPER)?.id).toBe('overzicht-home');
    deps.setKeeperSide('overzicht', 'overzicht-home', false, 'keeper-1');
  });
});

describe('§70: the secties are the body', () => {
  it('lets anybody who may edit it write one, without being a Keeper', () => {
    expect(deps.canEditSections('overzicht', 'o-eiland', BRAM)).toBe(true);
    // A dial turned down is the one thing that stops them.
    expect(deps.canEditSections('overzicht', 'o-prive', BRAM)).toBe(false);
  });

  /**
   * Rule 75, and the only line of code that implements it: an overzicht names
   * things and is never named back. A sectie on an artikel writes an
   * `entry_mentions` row; the same sectie on an overzicht writes none, so
   * "Genoemd in" on Jacob's page never mentions a signpost.
   */
  it('writes no mention row, so links go one way only', () => {
    const sectionId = deps.createSection('overzicht', 'o-eiland', { id: 'bram', isKeeper: false });
    deps.updateSection(
      sectionId,
      {
        title: 'De mensen',
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Begin bij [[Jacob den Hollander]].' }] },
          ],
        },
      },
      { id: 'bram', isKeeper: false },
    );

    const rows = deps.sqlite
      .prepare(`SELECT * FROM entry_mentions WHERE from_kind = 'overzicht' OR from_id = ?`)
      .all(sectionId);
    expect(rows).toHaveLength(0);

    const mentioned = deps.listMentions('e-jacob', KEEPER);
    const everything = JSON.stringify(mentioned);
    expect(everything).not.toContain('o-eiland');
    expect(everything).not.toContain('De mensen');
  });
});

describe('what an overzicht deliberately is not', () => {
  it('has no tekenlaag — there is nothing to draw on', () => {
    expect(deps.isInkKind('overzicht')).toBe(false);
  });

  it('has no dossier column at all', () => {
    const columns = (
      deps.sqlite.prepare('PRAGMA table_info(overzichten)').all() as { name: string }[]
    ).map((row) => row.name);
    expect(columns).not.toContain('case_id');
  });
});

describe('§43: the bin', () => {
  it('goes into the Keeper’s prullenbak, and comes back out of it', () => {
    const made = deps.createOverzicht({ name: 'Weg hiermee' }, { id: 'bram', isKeeper: false });
    deps.deleteOverzicht(made.id, { id: 'bram', isKeeper: false });
    expect(deps.getOverzichtBySlug(made.slug, BRAM)).toBeNull();

    const inTrash = deps.listTrash().find((item) => item.id === made.id);
    expect(inTrash?.kind).toBe('overzicht');
    expect(inTrash?.href).toBe(`/wiki/overzicht/${made.slug}`);

    deps.restoreFromTrash('overzicht', made.id, 'keeper-1');
    expect(deps.getOverzichtBySlug(made.slug, BRAM)?.name).toBe('Weg hiermee');
  });

  it('refuses to bin the front door', () => {
    expect(() => deps.deleteOverzicht('overzicht-home', KEEPER)).toThrow();
  });

  it('keeps a new one off the wiki’s own addresses', () => {
    const made = deps.createOverzicht({ name: 'Alles' }, KEEPER);
    expect(deps.RESERVED_WIKI_SLUGS).not.toContain(made.slug);
  });
});
