import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { linkHandlesIn } from '@/lib/entries/docLinks.mjs';
import { tokenFor } from '@/lib/entries/shortTokens.mjs';

/**
 * §101 naden (golf 3) — kleine reparaties waar rondes 58–62 samenkomen.
 *
 *   1. de omschrijving van een prikbord telt mee onder "Genoemd in", op
 *      dezelfde weg als die van een landkaart, tijdlijn en stamboom (§98);
 *   2. een link die bij het schrijven wegvalt (`cleanDocRefs`) laat geen
 *      dubbele spatie achter — en een verborgen link komt nog steeds terug
 *      op zijn plek;
 *   3. `Kamer maken` (E3, `mayHoldRoom`): een Persoon krijgt er alleen een
 *      als aan deze tafel iemand een Persoon draagt — en een karakter in de
 *      prullenbak draagt niemand.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-63-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k63', isKeeper: true };
const SPELER = { id: 's63', isKeeper: false };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  refs: typeof import('@/lib/entries/shortRefs');
  mentions: typeof import('@/lib/entries/mentions');
  boards: typeof import('@/lib/boards/service');
  kamers: typeof import('@/lib/kamers/service');
};
let deps: Deps;

const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

const para = (...content: object[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });
const link = (handle: string) => ({ type: 'entryLink', attrs: { handle } });
const docOf = (...blocks: object[]) => ({ type: 'doc', content: blocks });

let jan: string;
let secret: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    refs: await import('@/lib/entries/shortRefs'),
    mentions: await import('@/lib/entries/mentions'),
    boards: await import('@/lib/boards/service'),
    kamers: await import('@/lib/kamers/service'),
  };
  for (const [id, name, keeper] of [
    ['k63', 'Keeper', 1],
    ['s63', 'Speler', 0],
  ] as const) {
    run(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`, id, name, name.toLowerCase(), keeper);
  }
  for (const [id, name, visibility] of [
    ['jan', 'Jan Vermeer', 'all'],
    ['geheim', 'Het Geheim', 'keeper'],
  ] as const) {
    run(
      `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '', '{}', '[]', ?, 'k63', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  }
  jan = deps.refs.mintHandle('jan', KEEPER)!;
  secret = deps.refs.mintHandle('geheim', KEEPER)!;
});

describe('de omschrijving van een prikbord onder "Genoemd in"', () => {
  it('counts on a wall with no cards at all, under nothing but its name, and goes when it is taken out', () => {
    const board = deps.boards.createBoard({ name: 'Muur 63', createdBy: 'k63' });
    const onBoard = () => deps.mentions.listMentions('jan', KEEPER).filter((m) => m.kind === 'board' && m.id === board.id);
    expect(onBoard()).toEqual([]);

    deps.boards.setBoardDescription(board.id, `Alles over ${tokenFor(jan)}`, KEEPER);
    expect(onBoard()).toHaveLength(1);
    expect(onBoard()[0].detail).toBe('');

    // A wall that is rebuilt from scratch still counts it (`rebuildAllMentions`).
    deps.mentions.rebuildAllMentions();
    expect(onBoard()).toHaveLength(1);

    deps.boards.setBoardDescription(board.id, 'Niemand meer.', KEEPER);
    expect(onBoard()).toEqual([]);
  });

  it('a card saved afterwards keeps the omschrijving counted', () => {
    const board = deps.boards.createBoard({ name: 'Muur 63b', createdBy: 'k63' });
    deps.boards.setBoardDescription(board.id, `Over ${tokenFor(jan)}`, KEEPER);
    const card = {
      id: 'kaart63', kind: 'note' as const, entryId: null, mapId: null, caseId: null, timelineId: null, boardId: null,
      familyTreeId: null, assetId: null, showImage: false, border: null, name: 'Vraag', text: 'Geen namen hier', x: 10, y: 10,
      rotation: 0, scale: 1, updatedAt: Date.now(),
    };
    deps.boards.saveBoard(board.id, { cards: [card] } as never, KEEPER);
    deps.mentions.recomputeBoardMentions(board.id);
    expect(deps.mentions.listMentions('jan', KEEPER).some((m) => m.kind === 'board' && m.id === board.id)).toBe(true);
  });
});

describe('cleanDocRefs: a link that falls away leaves one space', () => {
  it('a new link to what the writer may not see goes, and its two spaces become one', () => {
    const out = deps.refs.cleanDocRefs(docOf(para(text('zag '), link(secret), text(' bij de sluis'))), { prev: null, actor: SPELER }) as {
      content: { content: { type: string; text?: string }[] }[];
    };
    expect(out.content[0].content).toEqual([text('zag bij de sluis')]);
  });

  it('at the start or the end of a line, the space against the edge goes', () => {
    const start = deps.refs.cleanDocRefs(docOf(para(link(secret), text(' kwam binnen'))), { prev: null, actor: SPELER }) as {
      content: { content: unknown[] }[];
    };
    expect(start.content[0].content).toEqual([text('kwam binnen')]);
    const end = deps.refs.cleanDocRefs(docOf(para(text('Brief van '), link(secret))), { prev: null, actor: SPELER }) as {
      content: { content: unknown[] }[];
    };
    expect(end.content[0].content).toEqual([text('Brief van')]);
  });

  it('touches only the seam: two spaces typed elsewhere stay, and a link the writer may name stays', () => {
    const doc = docOf(para(text('a  b '), link(jan), text(' c '), link(secret), text(' d')));
    const out = deps.refs.cleanDocRefs(doc, { prev: null, actor: SPELER }) as { content: { content: unknown[] }[] };
    expect(out.content[0].content).toEqual([text('a  b '), link(jan), text(' c d')]);
  });

  it('keeps marks apart, and leaves a document without a gap object for object', () => {
    const bold = { type: 'text', text: ' vet', marks: [{ type: 'bold' }] };
    const out = deps.refs.cleanDocRefs(docOf(para(text('plat '), link(secret), bold)), { prev: null, actor: SPELER }) as {
      content: { content: unknown[] }[];
    };
    expect(out.content[0].content).toEqual([text('plat '), { ...bold, text: 'vet' }]);
    const clean = docOf(para(text('zag '), link(jan), text(' bij')));
    expect(deps.refs.cleanDocRefs(clean, { prev: null, actor: SPELER })).toBe(clean);
  });

  it('does not break the road back: a hidden link the speler left out still returns where it stood', () => {
    const prev = docOf(para(text('Brief van '), link(secret), text(' aan '), link(jan)));
    // The speler saw "Brief van  aan Jan" and wrote a new line around it.
    const theirs = docOf(para(text('Brief van aan '), link(jan), text(' — gelezen.')));
    const out = deps.refs.cleanDocRefs(theirs, { prev, actor: SPELER }) as { content: { content: unknown[] }[] };
    expect(linkHandlesIn(out)).toEqual([secret, jan]);
    expect(out.content[0].content[0]).toEqual(text('Brief van '));
    expect(out.content[0].content[1]).toEqual(link(secret));
  });
});

describe('E3: Kamer maken op een Persoon', () => {
  it('only where somebody at this table wears a Persoon, and a karakter in the prullenbak is worn by nobody', () => {
    run(
      `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode)
       VALUES ('p-los', 'character', 'Adriaan Los', 'p-los', '', '{}', '[]', 'all', 'k63', 'all')`,
    );
    // Nobody wears a Persoon: no kamer, and the service refuses as well.
    expect(deps.kamers.mayHoldRoom('p-los')).toBe(false);
    expect(deps.kamers.openRoomFor('p-los', KEEPER)).toBeNull();

    run(
      `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode, deleted_at)
       VALUES ('p-weg', 'character', 'Weggegooid', 'p-weg', '', '{}', '[]', 'all', 's63', 'all', 1)`,
    );
    run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('s63', 'p-weg', 0)`);
    // Worn, but in the prullenbak: still nobody.
    expect(deps.kamers.mayHoldRoom('p-los')).toBe(false);
    expect(deps.kamers.openRoomFor('p-los', KEEPER)).toBeNull();
    expect(deps.kamers.roomIdFor('p-los')).toBeNull();

    // Back from the prullenbak: now a Persoon is a soort somebody plays.
    run(`UPDATE entries SET deleted_at = NULL WHERE id = 'p-weg'`);
    expect(deps.kamers.mayHoldRoom('p-los')).toBe(true);
  });
});
