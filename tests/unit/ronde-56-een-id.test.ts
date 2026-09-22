import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { alignedDelta } from '@/lib/editor/shortBox';
import {
  dropStrayDelimiters,
  handlesIn,
  legacySpans,
  projectShort,
  splitShort,
  tokenFor,
  upgradeLegacy,
} from '@/lib/entries/shortTokens.mjs';

/**
 * §95, ronde 56 — één regel, één id.
 *
 * A mention in a short box (korte beschrijving, samenvatting, infobox Tekst /
 * Lange tekst) is `⟦handle⟧`, and `mention_handles` says which artikel the
 * handle means. What is pinned here:
 *
 *   1. the token's shape, pure;
 *   2. migration 0034 (`upgradeArchive`) on a fixture with two artikelen of one
 *      name: the oldest wins, exactly as the reader chose — and a second run
 *      changes nothing;
 *   3. a rename is a new name on every chip, at once (A3);
 *   4. a handle a speler may not follow gives them no name and no id — not in
 *      the chips a page hands down, not in the letters of a history line;
 *   5. `cleanShort`, §89 for a short text, on every road in.
 *
 * Asked of a real SQLite file: every one of these is a question about SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-56-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k56', isKeeper: true };
const SPELER = { id: 's56', isKeeper: false };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  upgradeArchive: typeof import('@/lib/entries/shortUpgrade.mjs').upgradeArchive;
  refs: typeof import('@/lib/entries/shortRefs');
  entries: typeof import('@/lib/entries/service');
  MIGRATIONS: typeof import('@/lib/db/migrations.mjs').MIGRATIONS;
};
let deps: Deps;

const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
const one = <T>(sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).get(...args) as T;

function entry(id: string, name: string, createdAt: number, extra: { short?: string; fields?: object; visibility?: string; type?: string } = {}) {
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'k56', 'all', ?)`,
    id,
    extra.type ?? 'character',
    name,
    id,
    extra.short ?? '',
    JSON.stringify(extra.fields ?? {}),
    extra.visibility ?? 'all',
    createdAt,
  );
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    upgradeArchive: (await import('@/lib/entries/shortUpgrade.mjs')).upgradeArchive,
    refs: await import('@/lib/entries/shortRefs'),
    entries: await import('@/lib/entries/service'),
    MIGRATIONS: (await import('@/lib/db/migrations.mjs')).MIGRATIONS,
  };
  for (const [id, name, keeper] of [
    ['k56', 'Keeper', 1],
    ['s56', 'Speler', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  // Two artikelen called "Het Verdronken Kind": the persoon is the older.
  entry('kind-persoon', 'Het Verdronken Kind', 1000);
  entry('kind-wezen', 'Het Verdronken Kind', 2000, { type: 'bovennatuurlijke-wezens' });
  entry('jan', 'Jan Vermeer', 1500);
  entry('geheim', 'Het Geheim', 1600, { visibility: 'keeper' });
  // Before 0034's conversion: the letters.
  entry('bron', 'Bron', 3000, {
    short: 'Zag [[Het Verdronken Kind]] met @Jan Vermeer. En [[Niemand]] en @niemand.',
    fields: { occupation: 'Knecht van [[Jan Vermeer]]', status: 'levend' },
  });
  run(`INSERT INTO cases (id, name, slug, summary) VALUES ('d56', 'Dossier', 'd56', 'Over [[Het Geheim]]')`);
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, created_at) VALUES ('rev56', 'bron', ?, 1)`,
    JSON.stringify({ shortDescription: 'Oud: [[Jan Vermeer]]', fields: {} }),
  );
  run(`INSERT INTO live_docs (room, state) VALUES ('entry:bron:fields', x'00'), ('entry:bron:body', x'00')`);
});

/* ------------------------------------------------------------ 1. pure */

describe('the token', () => {
  it('is a handle between ⟦ and ⟧, and nothing else counts', () => {
    const text = `a ${tokenFor('abcdef123')} b ⟦kort⟧ ⟦ c`;
    expect(handlesIn(text)).toEqual(['abcdef123']);
    expect(splitShort(text).map((p) => p.kind)).toEqual(['text', 'chip', 'text']);
    expect(dropStrayDelimiters(text)).toBe(`a ${tokenFor('abcdef123')} b kort  c`);
  });

  it('reads as the name a reader may see, or as nothing, without a double space', () => {
    const text = `Brief van ${tokenFor('aaaaaa1')} aan ${tokenFor('bbbbbb2')} en ${tokenFor('cccccc3')}`;
    const names: Record<string, string> = { aaaaaa1: 'Jan', cccccc3: 'Piet' };
    expect(projectShort(text, (h: string) => names[h] ?? null)).toBe('Brief van Jan aan en Piet');
  });

  it('a delta between two texts never cuts a chip in half', () => {
    const a = `x ${tokenFor('abcdefA1')} y`;
    const b = `x ${tokenFor('abcdefB2')} y`;
    const delta = alignedDelta(a, b)!;
    expect(a.slice(delta.at, delta.at + delta.remove)).toBe(tokenFor('abcdefA1'));
    expect(delta.insert).toBe(tokenFor('abcdefB2'));
  });

  it('upgrading is the old reading, and a second pass changes nothing', () => {
    const byName = new Map([['jan vermeer', 'jan']]);
    let n = 0;
    const mint = () => `hndl${String(++n).padStart(4, '0')}`;
    const once = upgradeLegacy('Met @Jan Vermeer, en [[jan vermeer]] en [[Niemand]].', byName, mint);
    expect(once.text).toBe(`Met ${tokenFor('hndl0001')}, en ${tokenFor('hndl0002')} en [[Niemand]].`);
    const twice = upgradeLegacy(once.text, byName, mint);
    expect(twice.changed).toBe(false);
    expect(legacySpans('en [[Niemand]]', byName)[0].entryId).toBeNull();
  });
});

/* ------------------------------------------------------- 2. migration */

describe('0034_een_id', () => {
  it('is appended, guarded and carries its step in JavaScript', () => {
    const last = deps.MIGRATIONS[deps.MIGRATIONS.length - 1] as { name: string; sql: string; run?: unknown };
    expect(last.name).toBe('0034_een_id');
    expect(last.sql).toContain('CREATE TABLE IF NOT EXISTS mention_handles');
    expect(typeof last.run).toBe('function');
  });

  it('turns every name the reader resolved into a handle — the oldest of two — and leaves the rest as letters', () => {
    const result = deps.upgradeArchive(deps.sqlite);
    expect(result.texts).toBeGreaterThan(0);
    const row = one<{ short_description: string; fields: string }>('SELECT short_description, fields FROM entries WHERE id = ?', 'bron');
    const handles = handlesIn(row.short_description);
    expect(handles).toHaveLength(2);
    const targets = handles.map((h) => one<{ entry_id: string }>('SELECT entry_id FROM mention_handles WHERE handle = ?', h).entry_id);
    // A2 as it was: the oldest "Het Verdronken Kind" is the persoon.
    expect(targets).toEqual(['kind-persoon', 'jan']);
    expect(row.short_description).toContain('[[Niemand]]');
    expect(row.short_description).toContain('@niemand.');
    const fields = JSON.parse(row.fields) as Record<string, string>;
    expect(handlesIn(fields.occupation)).toHaveLength(1);
    expect(fields.status).toBe('levend');
    // The dossier, the copies, and the room's stale state.
    expect(handlesIn(one<{ summary: string }>(`SELECT summary FROM cases WHERE id = 'd56'`).summary)).toHaveLength(1);
    const snap = JSON.parse(one<{ snapshot: string }>(`SELECT snapshot FROM entry_revisions WHERE id = 'rev56'`).snapshot);
    expect(handlesIn(snap.shortDescription)).toHaveLength(1);
    expect(one(`SELECT room FROM live_docs WHERE room = 'entry:bron:fields'`)).toBeUndefined();
    expect(one(`SELECT room FROM live_docs WHERE room = 'entry:bron:body'`)).toBeTruthy();
    // The search index reads the names, not the handles.
    const fts = one<{ short_description: string }>(`SELECT short_description FROM entries_fts WHERE entry_id = 'bron'`);
    expect(fts.short_description).toContain('Het Verdronken Kind');
    expect(fts.short_description).not.toContain('⟦');
  });

  it('is idempotent: a second run finds nothing and mints nothing', () => {
    const before = one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n;
    const text = one<{ short_description: string }>(`SELECT short_description FROM entries WHERE id = 'bron'`).short_description;
    expect(deps.upgradeArchive(deps.sqlite)).toEqual({ texts: 0, handles: 0 });
    expect(one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n).toBe(before);
    expect(one<{ short_description: string }>(`SELECT short_description FROM entries WHERE id = 'bron'`).short_description).toBe(text);
  });
});

/* ------------------------------------------------------- 3 + 4. reading */

describe('reading a handle', () => {
  it('A3: a rename is the new name on the chip at once', () => {
    const [kind] = handlesIn(one<{ short_description: string }>(`SELECT short_description FROM entries WHERE id = 'bron'`).short_description);
    run(`UPDATE entries SET name = 'Het Gevonden Kind' WHERE id = 'kind-persoon'`);
    expect(deps.refs.resolveHandles(SPELER, [kind]).get(kind)?.name).toBe('Het Gevonden Kind');
    run(`UPDATE entries SET name = 'Het Verdronken Kind' WHERE id = 'kind-persoon'`);
  });

  it('rule 1: a handle a speler may not follow gives no name and no id — only a null', () => {
    const summary = one<{ summary: string }>(`SELECT summary FROM cases WHERE id = 'd56'`).summary;
    const [secret] = handlesIn(summary);
    expect(deps.refs.resolveHandles(KEEPER, [secret]).get(secret)?.name).toBe('Het Geheim');
    expect(deps.refs.resolveHandles(SPELER, [secret]).size).toBe(0);
    const map = deps.refs.shortChipsFor(SPELER, [summary]);
    expect(map).toEqual({ [secret]: null });
    const wire = JSON.stringify(map);
    expect(wire).not.toContain('Geheim');
    expect(wire).not.toContain('geheim');
    expect(deps.refs.plainShort(SPELER, summary)).toBe('Over');
    expect(deps.refs.plainShort(KEEPER, summary)).toBe('Over Het Geheim');
  });

  it('a speler cannot mint a handle for what they may not see', () => {
    expect(deps.refs.mintHandle('geheim', SPELER)).toBeNull();
    expect(deps.refs.mintHandle('jan', SPELER)).toMatch(/^[A-Za-z0-9]{12}$/);
  });
});

/* ------------------------------------------------------------ 5. clean */

describe('cleanShort — §89 for a short text', () => {
  it('drops stray delimiters, control characters and — in one line — the line breaks', () => {
    expect(deps.refs.cleanShort('a\u0000b\nc ⟦x', { actor: KEEPER })).toBe('ab c x');
    expect(deps.refs.cleanShort('a\nb', { actor: KEEPER, multiline: true })).toBe('a\nb');
  });

  it('drops a handle that does not exist, and a new one to what the writer may not see', () => {
    const secret = deps.refs.mintHandle('geheim', KEEPER)!;
    expect(deps.refs.cleanShort(`x ${tokenFor('bestaatniet1')} y`, { actor: KEEPER })).toBe('x  y');
    expect(deps.refs.cleanShort(`x ${tokenFor(secret)}`, { actor: SPELER })).toBe('x ');
    expect(deps.refs.cleanShort(`x ${tokenFor(secret)}`, { actor: KEEPER })).toBe(`x ${tokenFor(secret)}`);
  });

  it('puts back what the writer could not see and left out (§67)', () => {
    const secret = deps.refs.mintHandle('geheim', KEEPER)!;
    const prev = `Over ${tokenFor(secret)} en meer`;
    expect(deps.refs.cleanShort('Nieuwe tekst', { prev, actor: SPELER })).toBe(`Nieuwe tekst ${tokenFor(secret)}`);
    // The Keeper sees it, so the Keeper may take it out.
    expect(deps.refs.cleanShort('Nieuwe tekst', { prev, actor: KEEPER })).toBe('Nieuwe tekst');
  });

  it('a typed-out [[Naam]] becomes a chip, but only for a hand that may see it', () => {
    const kept = deps.refs.cleanShort('Bij [[Jan Vermeer]] en [[Het Geheim]]', { actor: SPELER });
    expect(handlesIn(kept)).toHaveLength(1);
    expect(kept).toContain('[[Het Geheim]]');
    expect(handlesIn(deps.refs.cleanShort('Bij [[Het Geheim]]', { actor: KEEPER }))).toHaveLength(1);
  });

  it('updateEntry cleans the korte beschrijving and an infobox Tekst on the way in', () => {
    const secret = deps.refs.mintHandle('geheim', KEEPER)!;
    run(`UPDATE entries SET short_description = ? WHERE id = 'jan'`, `Kent ${tokenFor(secret)}`);
    deps.entries.updateEntry('jan', { shortDescription: 'Kent niemand ⟦' }, { ...KEEPER, id: 'k56', isKeeper: false, characterId: null });
    const short = one<{ short_description: string }>(`SELECT short_description FROM entries WHERE id = 'jan'`).short_description;
    // Speler Keeper-less account: the secret stays, the stray bracket goes.
    expect(short).toBe(`Kent niemand ${tokenFor(secret)}`);
  });
});
