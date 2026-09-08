import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §53: linking a tweeling out of two pages that already exist.
 *
 * §44 could only ever *make* the second face, and that is the wrong door for
 * the way the tool is used — a Keeper preps on their own side while the table
 * writes the wiki page about the same thing, and the two meet later. The rules
 * of that meeting are the kind that quietly stop being true, so they are
 * pinned here against a real SQLite file:
 *
 *   - two existing pages become one thing with two faces, readable from both
 *     ends, with one text between them;
 *   - a pair that was already roped is **promoted**, not doubled — the road
 *     that used to hand the old rope back untouched and say it had worked;
 *   - a page that already has another face is refused in Dutch, by the JS
 *     guard, before the partial unique index has to say it in SQL;
 *   - untying puts them back the way they were, both of them still there;
 *   - and none of it is ever readable by a player: every end goes through
 *     `keeperRef`, so a tie can never be the thing that names a hidden page.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-twinlink-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  keeperRef: typeof import('@/lib/keeper/side').keeperRef;
  tiesFor: typeof import('@/lib/keeper/ties').tiesFor;
  twinOf: typeof import('@/lib/keeper/ties').twinOf;
  addTie: typeof import('@/lib/keeper/ties').addTie;
  linkTwin: typeof import('@/lib/keeper/ties').linkTwin;
  removeTie: typeof import('@/lib/keeper/ties').removeTie;
  notesTarget: typeof import('@/lib/keeper/notes').notesTarget;
  readKeeperNotes: typeof import('@/lib/keeper/notes').readKeeperNotes;
  writeKeeperNotes: typeof import('@/lib/keeper/notes').writeKeeperNotes;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

const countTies = () =>
  (deps.sqlite.prepare('SELECT COUNT(*) AS n FROM counterparts').get() as { n: number }).n;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const side = await import('@/lib/keeper/side');
  const ties = await import('@/lib/keeper/ties');
  const notes = await import('@/lib/keeper/notes');
  deps = {
    sqlite: dbModule.sqlite,
    keeperRef: side.keeperRef,
    tiesFor: ties.tiesFor,
    twinOf: ties.twinOf,
    addTie: ties.addTie,
    linkTwin: ties.linkTwin,
    removeTie: ties.removeTie,
    notesTarget: notes.notesTarget,
    readKeeperNotes: notes.readKeeperNotes,
    writeKeeperNotes: notes.writeKeeperNotes,
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

  const entry = (id: string, name: string, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  // The pair the players wrote and the pair the Keeper prepped, about one thing.
  entry('e-wiki', 'De veerman');
  entry('e-prep', 'De veerman — Keeper', 'keeper');
  // A second pair, for the refusals.
  entry('e-wiki-2', 'De vuurtoren');
  entry('e-prep-2', 'De vuurtoren — Keeper', 'keeper');

  const kase = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES (?, ?, ?, 'keeper-1', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  kase('c-open', 'De verdwijning');
  kase('c-dicht', 'De verdwijning — Keeper', 1);
});

describe('§53: two pages that already exist become one thing with two faces', () => {
  it('is readable from both ends, and the notes become one text on the Keeper’s side', () => {
    deps.writeKeeperNotes('entry', 'e-wiki', 'Wat de tafel zelf al opschreef.', KEEPER);
    deps.writeKeeperNotes('entry', 'e-prep', 'De veerman dekt iemand.', KEEPER);

    deps.linkTwin({ kind: 'entry', id: 'e-prep' }, { kind: 'entry', id: 'e-wiki' }, KEEPER.id);

    expect(deps.twinOf('entry', 'e-wiki', KEEPER)?.id).toBe('e-prep');
    expect(deps.twinOf('entry', 'e-prep', KEEPER)?.id).toBe('e-wiki');
    expect(deps.tiesFor('entry', 'e-wiki', KEEPER).twin?.isTwin).toBe(true);

    // One text, kept on the Keeper's page, with neither half thrown away.
    expect(deps.notesTarget('entry', 'e-wiki')).toEqual({ kind: 'entry', id: 'e-prep' });
    const text = deps.readKeeperNotes('entry', 'e-wiki', KEEPER);
    expect(text).toContain('De veerman dekt iemand.');
    expect(text).toContain('Wat de tafel zelf al opschreef.');
    expect(deps.readKeeperNotes('entry', 'e-prep', KEEPER)).toBe(text);
  });

  it('does not link two pages on the same side, or two different soorten', () => {
    expect(() =>
      deps.linkTwin({ kind: 'entry', id: 'e-wiki-2' }, { kind: 'case', id: 'c-open' }, KEEPER.id),
    ).toThrow('Een tweeling is twee keer hetzelfde soort ding.');
    expect(() =>
      deps.linkTwin({ kind: 'entry', id: 'e-wiki-2' }, { kind: 'entry', id: 'e-wiki' }, KEEPER.id),
    ).toThrow('Een tweeling is één pagina van de Keeper en één van de spelers.');
    expect(() =>
      deps.linkTwin({ kind: 'entry', id: 'e-prep-2' }, { kind: 'entry', id: 'e-prep' }, KEEPER.id),
    ).toThrow('Een tweeling is één pagina van de Keeper en één van de spelers.');
  });

  it('refuses a page that already has another face, in Dutch', () => {
    expect(() =>
      deps.linkTwin({ kind: 'entry', id: 'e-prep-2' }, { kind: 'entry', id: 'e-wiki' }, KEEPER.id),
    ).toThrow('Een van de twee heeft al een andere kant.');
    expect(() =>
      deps.linkTwin({ kind: 'entry', id: 'e-prep' }, { kind: 'entry', id: 'e-wiki-2' }, KEEPER.id),
    ).toThrow('Een van de twee heeft al een andere kant.');
    // And nothing was written on the way to being refused.
    expect(deps.twinOf('entry', 'e-wiki-2', KEEPER)).toBeNull();
    expect(deps.twinOf('entry', 'e-prep-2', KEEPER)).toBeNull();
  });

  it('promotes a rope that already ties the pair instead of writing a second row', () => {
    const roped = deps.addTie(
      { kind: 'entry', id: 'e-prep-2' },
      { kind: 'entry', id: 'e-wiki-2' },
      KEEPER.id,
    );
    expect(deps.tiesFor('entry', 'e-wiki-2', KEEPER).ropes).toHaveLength(1);
    const before = countTies();

    const linked = deps.linkTwin(
      { kind: 'entry', id: 'e-wiki-2' },
      { kind: 'entry', id: 'e-prep-2' },
      KEEPER.id,
    );

    expect(linked).toBe(roped);
    expect(countTies()).toBe(before);
    const ties = deps.tiesFor('entry', 'e-wiki-2', KEEPER);
    expect(ties.twin?.other.id).toBe('e-prep-2');
    expect(ties.ropes).toHaveLength(0);
  });

  it('untying leaves both pages standing and single again', () => {
    const tie = deps.tiesFor('entry', 'e-wiki-2', KEEPER).twin;
    expect(tie).not.toBeNull();
    deps.removeTie(tie!.id, KEEPER.id);

    expect(deps.twinOf('entry', 'e-wiki-2', KEEPER)).toBeNull();
    expect(deps.twinOf('entry', 'e-prep-2', KEEPER)).toBeNull();
    expect(deps.keeperRef('entry', 'e-wiki-2', KEEPER)?.name).toBe('De vuurtoren');
    expect(deps.keeperRef('entry', 'e-prep-2', KEEPER)?.name).toBe('De vuurtoren — Keeper');
    // Free again: the pair may be linked a second time.
    deps.linkTwin({ kind: 'entry', id: 'e-prep-2' }, { kind: 'entry', id: 'e-wiki-2' }, KEEPER.id);
    expect(deps.twinOf('entry', 'e-wiki-2', KEEPER)?.id).toBe('e-prep-2');
  });

  it('is nothing a player can see, from either end', () => {
    // The write road is `requireKeeper` in the route; this is the read one.
    expect(deps.tiesFor('entry', 'e-wiki', BRAM)).toEqual({ twin: null, ropes: [] });
    expect(deps.twinOf('entry', 'e-wiki', BRAM)).toBeNull();
    expect(deps.keeperRef('entry', 'e-prep', BRAM)).toBeNull();
    expect(deps.readKeeperNotes('entry', 'e-wiki', BRAM)).toBe('');
  });
});
