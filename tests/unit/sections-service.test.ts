import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §70, round 36: a sectie belongs to a *thing*, and anyone who may edit the
 * thing may add one.
 *
 * Two rights, not one, and this file's whole job is to hold them apart:
 *
 *  - **Making, writing, reordering and removing** ask the thing's own §17 edit
 *    dial (`canEditSections`). This is the half that opened up, and it opened
 *    up so a player could answer "where do I write down what this onderzoek
 *    turned up?" without wiping out what the last one found.
 *  - **The geheimhouding dial and the reveals stayed the Keeper's.** A player
 *    may write in the open; deciding who at the table may read it is prep, and
 *    prep is §9's.
 *
 * And §40, one layer up: a new kind of thing gets its dials on the day it is
 * built, so the dossier's secties are asked per viewer here too — a dossier
 * the whole table may open can carry a sectie only the Keeper may read.
 *
 * Against a real SQLite file, because every one of these is a rule about rows.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-sections-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listSections: typeof import('@/lib/sections/service').listSections;
  createSection: typeof import('@/lib/sections/service').createSection;
  updateSection: typeof import('@/lib/sections/service').updateSection;
  deleteSection: typeof import('@/lib/sections/service').deleteSection;
  setSectionReveals: typeof import('@/lib/sections/service').setSectionReveals;
  countHiddenSections: typeof import('@/lib/sections/service').countHiddenSections;
  sectionOwner: typeof import('@/lib/sections/service').sectionOwner;
  canEditSections: typeof import('@/lib/sections/service').canEditSections;
  startingVisibility: typeof import('@/lib/sections/service').startingVisibility;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
/** §18b: a player writes as somebody. Both of these hold an onderzoeker. */
const BRAM = { id: 'bram', isKeeper: false, characterId: 'vandijk' };
const AAGJE = { id: 'aagje', isKeeper: false, characterId: 'nel' };
const NOBODY = { id: 'nel', isKeeper: false, characterId: 'niemand' };

const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const sections = await import('@/lib/sections/service');
  deps = {
    sqlite: dbModule.sqlite,
    listSections: sections.listSections,
    createSection: sections.createSection,
    updateSection: sections.updateSection,
    deleteSection: sections.deleteSection,
    setSectionReveals: sections.setSectionReveals,
    countHiddenSections: sections.countHiddenSections,
    sectionOwner: sections.sectionOwner,
    canEditSections: sections.canEditSections,
    startingVisibility: sections.startingVisibility,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
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

  // An artikel anybody may edit, and one only its owner may.
  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
     VALUES ('e-open', 'character', 'De vuurtoren', 'de-vuurtoren', '{}', '[]', 'all', 'bram', 'all', 'all')`,
  );
  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
     VALUES ('e-vanbram', 'character', 'Van Bram', 'van-bram', '{}', '[]', 'all', 'bram', 'all', 'private')`,
  );

  // A dossier Bram owns and Aagje may only read, and one nobody but Bram has.
  run(
    `INSERT INTO cases (id, name, slug, status, created_by, view_mode, edit_mode)
     VALUES ('c-zaak', 'De zaak', 'de-zaak', 'open', 'bram', 'some', 'some')`,
  );
  run(
    `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'c-zaak', 'aagje', 1, 0)`,
  );
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('§70: what a new sectie starts as', () => {
  it('is prep for a Keeper and the open for everybody else', () => {
    expect(deps.startingVisibility(true)).toBe('keeper');
    expect(deps.startingVisibility(false)).toBe('all');
  });

  it('and `createSection` uses it, so a player never writes into a void', () => {
    const keepers = deps.createSection('entry', 'e-open', KEEPER);
    const players = deps.createSection('entry', 'e-open', BRAM);
    const rows = deps.listSections('entry', 'e-open', KEEPER);
    expect(rows.find((row) => row.id === keepers)?.visibility).toBe('keeper');
    expect(rows.find((row) => row.id === players)?.visibility).toBe('all');
    // §18b: and it records who wrote it, and as whom.
    expect(rows.find((row) => row.id === players)?.createdBy).toBe('bram');
    expect(rows.find((row) => row.id === players)?.characterId).toBe('vandijk');
    deps.deleteSection(keepers, KEEPER);
    deps.deleteSection(players, BRAM);
  });
});

describe('§70: who may make, write and remove one', () => {
  it('is the thing\'s own edit dial — an artikel anybody may edit', () => {
    expect(deps.canEditSections('entry', 'e-open', BRAM)).toBe(true);
    expect(deps.canEditSections('entry', 'e-open', AAGJE)).toBe(true);
    expect(deps.canEditSections('entry', 'e-open', KEEPER)).toBe(true);
  });

  it('and not a thing they may only read', () => {
    expect(deps.canEditSections('entry', 'e-vanbram', AAGJE)).toBe(false);
    expect(deps.canEditSections('entry', 'e-vanbram', BRAM)).toBe(true);
    expect(deps.canEditSections('case', 'c-zaak', AAGJE)).toBe(false);
    expect(deps.canEditSections('case', 'c-zaak', BRAM)).toBe(true);
    // Nobody at all is nobody here too: an anonymous reader edits nothing.
    expect(deps.canEditSections('case', 'c-zaak', null)).toBe(false);
    expect(deps.canEditSections('case', 'c-zaak', NOBODY)).toBe(false);
  });

  it('a player writes a sectie on a thing they may edit, and it lands', () => {
    const id = deps.createSection('entry', 'e-open', BRAM);
    deps.updateSection(id, { title: 'Wat we vonden', body: para('Een sleutel.') }, BRAM);
    const row = deps.listSections('entry', 'e-open', AAGJE).find((section) => section.id === id);
    expect(row?.title).toBe('Wat we vonden');
    expect(row?.bodyText).toContain('Een sleutel');
    // And removes their own again.
    deps.deleteSection(id, BRAM);
    expect(deps.listSections('entry', 'e-open', KEEPER).some((section) => section.id === id)).toBe(
      false,
    );
  });

  it('and a sectie of a dossier is the same rule, on the dossier', () => {
    const id = deps.createSection('case', 'c-zaak', BRAM);
    expect(deps.sectionOwner(id)).toEqual({ ownerKind: 'case', ownerId: 'c-zaak' });
    deps.updateSection(id, { title: 'Onderzoek van dinsdag', body: para('Niets.') }, BRAM);
    expect(
      deps.listSections('case', 'c-zaak', AAGJE).find((section) => section.id === id)?.title,
    ).toBe('Onderzoek van dinsdag');
    deps.deleteSection(id, BRAM);
  });
});

describe('§70: the dial and the reveals stayed the Keeper\'s', () => {
  let id = '';
  beforeAll(() => {
    id = deps.createSection('entry', 'e-open', BRAM);
    deps.updateSection(id, { title: 'Open stuk', body: para('In het licht.') }, BRAM);
  });

  it('a player may not turn the geheimhouding dial', () => {
    expect(() => deps.updateSection(id, { visibility: 'keeper' }, BRAM)).toThrow();
    // And nothing moved: the throw is before the write, not after it.
    expect(deps.listSections('entry', 'e-open', KEEPER).find((row) => row.id === id)?.visibility).toBe(
      'all',
    );
  });

  it('a player may still write the words in the same call shape', () => {
    // The dial is the *only* thing refused — a patch without it goes through.
    deps.updateSection(id, { title: 'Open stuk, bijgewerkt' }, BRAM);
    expect(deps.listSections('entry', 'e-open', BRAM).find((row) => row.id === id)?.title).toBe(
      'Open stuk, bijgewerkt',
    );
  });

  it('but a Keeper may, and then the sectie disappears for the table', () => {
    deps.updateSection(id, { visibility: 'keeper' }, KEEPER);
    expect(deps.listSections('entry', 'e-open', BRAM).some((row) => row.id === id)).toBe(false);
    expect(deps.listSections('entry', 'e-open', KEEPER).some((row) => row.id === id)).toBe(true);
    expect(deps.countHiddenSections('entry', 'e-open')).toBe(1);
  });

  it('and a reveal is per person, and only the Keeper is told who', () => {
    deps.updateSection(id, { visibility: 'players' }, KEEPER);
    deps.setSectionReveals(id, ['bram'], KEEPER.id);
    expect(deps.listSections('entry', 'e-open', BRAM).some((row) => row.id === id)).toBe(true);
    expect(deps.listSections('entry', 'e-open', AAGJE).some((row) => row.id === id)).toBe(false);
    // Rule 1: who it was shown to is the Keeper's business, so a player's copy
    // of the row does not carry the list at all.
    expect(deps.listSections('entry', 'e-open', KEEPER).find((row) => row.id === id)?.revealedTo).toEqual([
      'bram',
    ]);
    expect(deps.listSections('entry', 'e-open', BRAM).find((row) => row.id === id)?.revealedTo).toEqual(
      [],
    );
  });
});

describe('§40 on a dossier: the secties are read per viewer', () => {
  let open = '';
  let prep = '';
  beforeAll(() => {
    open = deps.createSection('case', 'c-zaak', BRAM);
    deps.updateSection(open, { title: 'Wat het onderzoek opleverde' }, BRAM);
    prep = deps.createSection('case', 'c-zaak', KEEPER);
    deps.updateSection(prep, { title: 'Wat de Keeper weet' }, KEEPER);
  });

  it('a dossier hands back its own secties, and only those', () => {
    const ids = deps.listSections('case', 'c-zaak', KEEPER).map((row) => row.id);
    expect(ids).toContain(open);
    expect(ids).toContain(prep);
    // Nothing of the artikel next door leaks in through the owner columns.
    expect(deps.listSections('entry', 'e-open', KEEPER).map((row) => row.id)).not.toContain(open);
  });

  it('and a keeper-only one is absent for the table — not faint, absent', () => {
    const ids = deps.listSections('case', 'c-zaak', AAGJE).map((row) => row.id);
    expect(ids).toEqual([open]);
    expect(deps.countHiddenSections('case', 'c-zaak')).toBe(1);
  });

  it('they come back in sort order, which is what reordering writes', () => {
    deps.updateSection(open, { sortOrder: 99 }, BRAM);
    expect(deps.listSections('case', 'c-zaak', KEEPER).map((row) => row.id)).toEqual([prep, open]);
    deps.updateSection(open, { sortOrder: 1 }, BRAM);
    expect(deps.listSections('case', 'c-zaak', KEEPER).map((row) => row.id)).toEqual([open, prep]);
  });
});
