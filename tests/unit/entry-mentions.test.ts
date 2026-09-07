import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §27: "Genoemd in" for the four sources that are not another artikel's body.
 *
 * Three claims matter more than the rest, and they are the reason this file
 * builds a real database instead of testing the pure halves on their own:
 *
 *  1. A recompute *replaces*. `entry_mentions` is derived, exactly like
 *     `entry_links` — rebuilt from the source on every save — so a source that
 *     stops naming an artikel stops naming it. A table that accumulated would
 *     keep insisting on a mention nobody can find in the text.
 *  2. A mention of an artikel that does not exist is dropped, not stored.
 *  3. **A mention the reader may not follow does not come back at all.** Not
 *     returned and hidden, not stamped MISSING. "There is an investigation you
 *     cannot see, and it is about you" is the leak §24 already worried about,
 *     and it leaks whether or not the dossier is named.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-mentions-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  updateCase: typeof import('@/lib/cases/service').updateCase;
  createBoard: typeof import('@/lib/boards/service').createBoard;
  saveBoard: typeof import('@/lib/boards/service').saveBoard;
  createSection: typeof import('@/lib/entries/secrets').createSection;
  updateSection: typeof import('@/lib/entries/secrets').updateSection;
  listMentions: typeof import('@/lib/entries/mentions').listMentions;
  recomputeMentions: typeof import('@/lib/entries/mentions').recomputeMentions;
  rebuildAllMentions: typeof import('@/lib/entries/mentions').rebuildAllMentions;
  entryIdsInText: typeof import('@/lib/entries/mentions').entryIdsInText;
  mentionSpans: typeof import('@/lib/entries/mentions').mentionSpans;
  plainMentions: typeof import('@/lib/entries/mentions').plainMentions;
  groupMentions: typeof import('@/lib/entries/mentions').groupMentions;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

/** A body document with one entryLink in it — what `@` and `[[` produce. */
const linking = (id: string, label: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Zie ook ' },
        { type: 'entryLink', attrs: { id, label } },
      ],
    },
  ],
});

/** Every id `entry_mentions` currently holds for one source, whatever it says. */
const storedFor = (kind: string, id: string) =>
  deps.sqlite
    .prepare('SELECT to_entry_id, detail FROM entry_mentions WHERE from_kind = ? AND from_id = ?')
    .all(kind, id) as { to_entry_id: string; detail: string }[];

let vuurtoren = '';
let jan = '';
let reliek = '';

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const cases = await import('@/lib/cases/service');
  const boards = await import('@/lib/boards/service');
  const secrets = await import('@/lib/entries/secrets');
  const mentions = await import('@/lib/entries/mentions');
  deps = {
    sqlite: dbModule.sqlite,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
    updateCase: cases.updateCase,
    createBoard: boards.createBoard,
    saveBoard: boards.saveBoard,
    createSection: secrets.createSection,
    updateSection: secrets.updateSection,
    listMentions: mentions.listMentions,
    recomputeMentions: mentions.recomputeMentions,
    rebuildAllMentions: mentions.rebuildAllMentions,
    entryIdsInText: mentions.entryIdsInText,
    mentionSpans: mentions.mentionSpans,
    plainMentions: mentions.plainMentions,
    groupMentions: mentions.groupMentions,
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

  // One investigation everybody may open, and one only Aagje may.
  deps.sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-open', 'Zaak Vlissingen', 'zaak-vlissingen', 'open', 'bram', 'all')`,
    )
    .run();
  deps.sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-stil', 'De brand van 1934', 'de-brand', 'open', 'aagje', 'private')`,
    )
    .run();

  vuurtoren = deps.createEntry({ typeSlug: 'location', name: 'De Vuurtoren', createdBy: 'bram' }).id;
  jan = deps.createEntry({ typeSlug: 'character', name: 'Jan Vermeer', createdBy: 'bram' }).id;
  reliek = deps.createEntry({ typeSlug: 'object', name: 'Het scheepsjournaal', createdBy: 'bram' }).id;
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the table is derived, never authored', () => {
  it('a recompute replaces what the source said before', () => {
    deps.recomputeMentions('case', 'c-open', [{ toEntryId: vuurtoren }]);
    expect(storedFor('case', 'c-open').map((row) => row.to_entry_id)).toEqual([vuurtoren]);

    // The same dossier, saved again, now naming somebody else entirely.
    deps.recomputeMentions('case', 'c-open', [{ toEntryId: jan }]);
    expect(storedFor('case', 'c-open').map((row) => row.to_entry_id)).toEqual([jan]);

    // And saved once more with nothing in it at all.
    deps.recomputeMentions('case', 'c-open', []);
    expect(storedFor('case', 'c-open')).toEqual([]);
  });

  it('drops a mention of an artikel that does not exist', () => {
    deps.recomputeMentions('case', 'c-open', [
      { toEntryId: vuurtoren },
      { toEntryId: 'nooit-bestaan' },
    ]);
    expect(storedFor('case', 'c-open').map((row) => row.to_entry_id)).toEqual([vuurtoren]);
    deps.recomputeMentions('case', 'c-open', []);
  });

  it('and never files the same thing twice, however often the source says it', () => {
    deps.recomputeMentions('case', 'c-open', [
      { toEntryId: vuurtoren, detail: 'Werktheorie' },
      { toEntryId: vuurtoren, detail: 'Werktheorie' },
      { toEntryId: vuurtoren, detail: 'Iets anders' },
    ]);
    expect(storedFor('case', 'c-open')).toHaveLength(2);
    deps.recomputeMentions('case', 'c-open', []);
  });
});

describe('a dossier the reader may not open', () => {
  beforeAll(() => {
    // Both investigations write the lighthouse into their working notes.
    deps.updateCase('c-open', { notes: linking(vuurtoren, 'De Vuurtoren') }, KEEPER);
    deps.updateCase('c-stil', { notes: linking(vuurtoren, 'De Vuurtoren') }, KEEPER);
  });

  it('is counted for the people who may', () => {
    const hers = deps.listMentions(vuurtoren, AAGJE).filter((m) => m.kind === 'case');
    expect(hers.map((m) => m.name).sort()).toEqual(['De brand van 1934', 'Zaak Vlissingen']);
    expect(hers.find((m) => m.name === 'Zaak Vlissingen')?.href).toBe('/c/zaak-vlissingen');
  });

  it('is not returned to the people who may not — not hidden, not stamped, absent', () => {
    const his = deps.listMentions(vuurtoren, BRAM);
    expect(his.filter((m) => m.kind === 'case').map((m) => m.name)).toEqual(['Zaak Vlissingen']);
    // The whole answer, serialised: the name of an investigation Bram may not
    // open must not be anywhere in it, under any key.
    expect(JSON.stringify(his)).not.toContain('brand van 1934');
    expect(JSON.stringify(his)).not.toContain('c-stil');
  });

  it('and a signed-out reader is told even less', () => {
    const names = deps
      .listMentions(vuurtoren, null)
      .filter((m) => m.kind === 'case')
      .map((m) => m.name);
    expect(names).toEqual(['Zaak Vlissingen']);
  });
});

describe('an infobox that points at somebody', () => {
  beforeAll(() => {
    deps.updateEntry(
      reliek,
      { fields: { current_holder: { id: jan, name: 'Jan Vermeer', slug: 'jan-vermeer' } } },
      KEEPER,
    );
  });

  it('prints the artikel and the label of the field that points there', () => {
    const mention = deps.listMentions(jan, KEEPER).find((m) => m.kind === 'field');
    expect(mention?.name).toBe('Het scheepsjournaal');
    expect(mention?.detail).toBe('Huidige houder');
  });

  it('and lets go when the field is emptied', () => {
    deps.updateEntry(reliek, { fields: { current_holder: null } }, KEEPER);
    expect(deps.listMentions(jan, KEEPER).filter((m) => m.kind === 'field')).toEqual([]);
    deps.updateEntry(
      reliek,
      { fields: { current_holder: { id: jan, name: 'Jan Vermeer', slug: 'jan-vermeer' } } },
      KEEPER,
    );
  });
});

describe('a section only some people have been shown', () => {
  let sectionId = '';

  beforeAll(() => {
    sectionId = deps.createSection(reliek, KEEPER.id);
    deps.updateSection(
      sectionId,
      { title: 'Wat de dokter wist', body: linking(vuurtoren, 'De Vuurtoren') },
      KEEPER.id,
    );
  });

  it('reaches the Keeper, with the section title after the artikel', () => {
    const mention = deps.listMentions(vuurtoren, KEEPER).find((m) => m.kind === 'section');
    expect(mention?.name).toBe('Het scheepsjournaal');
    expect(mention?.detail).toBe('Wat de dokter wist');
    expect(mention?.href).toContain('#section-');
  });

  it('and reaches nobody else while it is still prep', () => {
    expect(deps.listMentions(vuurtoren, BRAM).filter((m) => m.kind === 'section')).toEqual([]);
  });

  it('until it is turned on, and then everybody has it', () => {
    deps.updateSection(sectionId, { visibility: 'all' }, KEEPER.id);
    expect(deps.listMentions(vuurtoren, BRAM).map((m) => m.kind)).toContain('section');
    deps.updateSection(sectionId, { visibility: 'keeper' }, KEEPER.id);
  });
});

describe('a card on a wall', () => {
  let boardId = '';

  beforeAll(() => {
    boardId = deps.createBoard({ name: 'De muur', createdBy: 'bram' }).id;
    deps.saveBoard(
      boardId,
      {
        cards: [
          {
            id: 'card-1',
            kind: 'entry',
            entryId: vuurtoren,
            name: 'De Vuurtoren',
            // Round 18: the scribble under an artikel card names another
            // artikel — and its own, which says nothing new.
            text: 'Hier stond @Jan Vermeer op de avond zelf, bij [[De Vuurtoren]].',
            showImage: true,
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1,
          },
          {
            id: 'card-2',
            kind: 'note',
            name: 'Wie had de sleutel?',
            text: 'Volgens de havenmeester was [[Jan Vermeer]] er die avond.',
            showImage: true,
            x: 10,
            y: 10,
            rotation: 0,
            scale: 1,
          },
        ],
      },
      BRAM,
    );
  });

  it('stands for its artikel outright, with nothing printed after the wall', () => {
    const mention = deps.listMentions(vuurtoren, BRAM).find((m) => m.kind === 'board');
    expect(mention?.name).toBe('De muur');
    expect(mention?.detail).toBe('');
    expect(mention?.href).toBe(`/b/${boardId}`);
  });

  it('and a notitie that writes a name down counts, under the card', () => {
    const mentions = deps.listMentions(jan, BRAM).filter((m) => m.kind === 'board');
    expect(mentions.map((m) => m.detail).sort()).toEqual(['De Vuurtoren', 'Wie had de sleutel?']);
  });

  it('a scribble under an artikel card counts too, but never for its own artikel (round 18)', () => {
    // The Vuurtoren card names the Vuurtoren in its scribble: still one
    // mention for the Vuurtoren from this wall — the card itself — with
    // nothing printed after it.
    const mine = deps.listMentions(vuurtoren, BRAM).filter((m) => m.kind === 'board');
    expect(mine).toHaveLength(1);
    expect(mine[0].detail).toBe('');
  });

  it('but not a private wall somebody else hung', () => {
    deps.sqlite.prepare(`UPDATE boards SET view_mode = 'private' WHERE id = ?`).run(boardId);
    expect(deps.listMentions(vuurtoren, AAGJE).filter((m) => m.kind === 'board')).toEqual([]);
    // Its owner still has it.
    expect(deps.listMentions(vuurtoren, BRAM).filter((m) => m.kind === 'board')).toHaveLength(1);
    deps.sqlite.prepare(`UPDATE boards SET view_mode = 'all' WHERE id = ?`).run(boardId);
  });

  it('nor a wall its manager keeps out of the web — not even for its owner (round 18)', () => {
    deps.sqlite.prepare(`UPDATE boards SET in_web = 0 WHERE id = ?`).run(boardId);
    expect(deps.listMentions(vuurtoren, BRAM).filter((m) => m.kind === 'board')).toEqual([]);
    expect(deps.listMentions(vuurtoren, KEEPER).filter((m) => m.kind === 'board')).toEqual([]);
    deps.sqlite.prepare(`UPDATE boards SET in_web = 1 WHERE id = ?`).run(boardId);
    expect(deps.listMentions(vuurtoren, BRAM).filter((m) => m.kind === 'board')).toHaveLength(1);
  });
});

describe('reading a name out of plain text', () => {
  const byName = new Map([
    ['jan vermeer', 'e-jan'],
    ['jan', 'e-jan-alleen'],
    ['de vuurtoren', 'e-toren'],
  ]);

  it('takes both shorthands the archive teaches', () => {
    expect(deps.entryIdsInText('zie [[De Vuurtoren]] en @Jan Vermeer', byName)).toEqual([
      'e-toren',
      'e-jan',
    ]);
  });

  it('prefers the longest name, so a name inside a name is not stolen', () => {
    expect(deps.entryIdsInText('@Jan Vermeer kwam langs', byName)).toEqual(['e-jan']);
    expect(deps.entryIdsInText('@Jan kwam langs', byName)).toEqual(['e-jan-alleen']);
  });

  it('lets the sentence keep its punctuation', () => {
    expect(deps.entryIdsInText('en toen kwam @Jan Vermeer.', byName)).toEqual(['e-jan']);
  });

  it('and claims nothing it cannot match exactly', () => {
    expect(deps.entryIdsInText('@Jannetje uit Veere', byName)).toEqual([]);
    expect(deps.entryIdsInText('gewoon een zin over de vuurtoren', byName)).toEqual([]);
  });

  /* Round 21: the same reading, now with the positions kept. */

  it('says where each name stands, so a browser can print a chip there', () => {
    const text = 'zie [[De Vuurtoren]] en @Jan Vermeer.';
    const spans = deps.mentionSpans(text, byName);
    expect(spans.map((s) => [text.slice(s.start, s.end), s.name, s.entryId])).toEqual([
      ['[[De Vuurtoren]]', 'De Vuurtoren', 'e-toren'],
      ['@Jan Vermeer', 'Jan Vermeer', 'e-jan'],
    ]);
  });

  it('reads every @ in a line, not only the first', () => {
    // Before round 21 the scan swallowed a hundred and twenty characters at a
    // time, so the second name in a sentence was never looked for.
    expect(deps.entryIdsInText('@Jan Vermeer en @De Vuurtoren', byName)).toEqual(['e-jan', 'e-toren']);
  });

  it('keeps a bracketed name that matches nothing, and drops a bare @ that does not', () => {
    const spans = deps.mentionSpans('[[Niemand]] en @niemand', byName);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'Niemand', entryId: null });
  });

  it('gives the same ids as the reading it replaced', () => {
    for (const text of [
      'zie [[De Vuurtoren]] en @Jan Vermeer',
      '@Jan Vermeer kwam langs',
      '@Jan kwam langs',
      'en toen kwam @Jan Vermeer.',
      '@Jannetje uit Veere',
      'e-mail: post@vuurtoren.nl',
    ]) {
      const fromSpans = [...new Set(deps.mentionSpans(text, byName).map((s) => s.entryId).filter(Boolean))];
      expect(deps.entryIdsInText(text, byName)).toEqual(fromSpans);
    }
  });

  it('takes the brackets off for a canvas, and leaves @ alone', () => {
    expect(deps.plainMentions('zie [[De Vuurtoren]] en @Jan Vermeer')).toBe('zie De Vuurtoren en @Jan Vermeer');
    expect(deps.plainMentions('niets bijzonders')).toBe('niets bijzonders');
  });
});

describe('the refill', () => {
  it('throws the table away and builds the same answer back', () => {
    const before = deps.listMentions(vuurtoren, KEEPER);
    deps.sqlite.prepare('DELETE FROM entry_mentions').run();
    expect(deps.listMentions(vuurtoren, KEEPER)).toEqual([]);

    deps.rebuildAllMentions();
    expect(deps.listMentions(vuurtoren, KEEPER)).toEqual(before);
  });
});

describe('what the page prints', () => {
  it('groups by where the mention came from and drops the empty groups', () => {
    const groups = deps.groupMentions(deps.listMentions(vuurtoren, BRAM));
    // Bram may see one dossier and the wall; the section is still prep, and no
    // landkaart names the lighthouse — so neither group has a heading.
    expect(groups.map((group) => group.key)).toEqual(['case', 'board']);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });
});
