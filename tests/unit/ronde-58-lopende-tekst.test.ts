import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { docText, linkHandlesIn, mapLinks } from '@/lib/entries/docLinks.mjs';
import { handlesIn, tokenFor } from '@/lib/entries/shortTokens.mjs';
import { createZip, readZip } from '@/lib/zip.mjs';

/**
 * §97, ronde 58 — het lek in de lopende tekst.
 *
 * An `entryLink` in a rich document (an artikel's body, a section, a dossier's
 * notes) carried the id, name and slug of what it named to everybody who could
 * read the text — even when that artikel was hidden from them. Since this round
 * it carries a handle and nothing else (the §95 handles), and the name is
 * looked up per reader. What is pinned here:
 *
 *   1. the shape, pure: a link is its token in the plain text, never its name;
 *   2. migration 0035 (`upgradeDocs`) on a real SQLite file: every legacy link
 *      becomes a handle (the id was there, nothing is guessed), the plain
 *      texts and the copies follow, the rooms of what changed are forgotten,
 *      and the search index holds no name behind a chip — twice is once;
 *   3. per reader: a speler gets no name and no id of a hidden artikel, not in
 *      the chips a page hands down, not in the letters of a history line;
 *   4. the write road (`cleanDocRefs`): what a speler could not see and left
 *      out comes back where it stood, a new link is a handle this hand may
 *      name, and the proposal road keeps it too;
 *   5. search: a hidden name finds nothing; a visible one finds who names it;
 *   6. `scripts/restore.mjs` on a backup from before 0035.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-58-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k58', isKeeper: true };
const SPELER = { id: 's58', isKeeper: false };
const SPELER_AUTHOR = { ...SPELER, characterId: null };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  upgradeDocs: typeof import('@/lib/entries/docUpgrade.mjs').upgradeDocs;
  refs: typeof import('@/lib/entries/shortRefs');
  docRefs: typeof import('@/lib/entries/docRefs');
  entries: typeof import('@/lib/entries/service');
  search: typeof import('@/lib/search/service');
  review: typeof import('@/lib/entries/review');
  MIGRATIONS: typeof import('@/lib/db/migrations.mjs').MIGRATIONS;
  buildArchive: typeof import('@/lib/archive.mjs').buildArchive;
};
let deps: Deps;

const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
const one = <T>(sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).get(...args) as T;

/** A document the way the archive wrote it until round 58: a link with an id and a name. */
const legacyLink = (id: string, label: string) => ({ type: 'entryLink', attrs: { id, label, slug: id, icon: 'book', colour: '#123456' } });
const para = (...content: object[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });
const docOf = (...blocks: object[]) => ({ type: 'doc', content: blocks });

function entry(id: string, name: string, extra: { body?: object; bodyText?: string; visibility?: string; createdBy?: string; locked?: boolean } = {}) {
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, body, body_text, fields, tags, visibility, created_by, view_mode, edit_mode, is_locked)
     VALUES (?, 'character', ?, ?, '', ?, ?, '{}', '[]', ?, ?, 'all', 'all', ?)`,
    id,
    name,
    id,
    JSON.stringify(extra.body ?? { type: 'doc', content: [{ type: 'paragraph' }] }),
    // The plain text as the old `docToText` wrote it: with the labels in it.
    extra.bodyText ?? '',
    extra.visibility ?? 'all',
    extra.createdBy ?? 'k58',
    extra.locked ? 1 : 0,
  );
}

const bodyOf = (id: string) => JSON.parse(one<{ body: string }>('SELECT body FROM entries WHERE id = ?', id).body);

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    upgradeDocs: (await import('@/lib/entries/docUpgrade.mjs')).upgradeDocs,
    refs: await import('@/lib/entries/shortRefs'),
    docRefs: await import('@/lib/entries/docRefs'),
    entries: await import('@/lib/entries/service'),
    search: await import('@/lib/search/service'),
    review: await import('@/lib/entries/review'),
    MIGRATIONS: (await import('@/lib/db/migrations.mjs')).MIGRATIONS,
    buildArchive: (await import('@/lib/archive.mjs')).buildArchive,
  };
  for (const [id, name, keeper] of [
    ['k58', 'Keeper', 1],
    ['s58', 'Speler', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  entry('geheim', 'Het Geheim', { visibility: 'keeper' });
  entry('jan', 'Jan Vermeer');
  // Before 0035's conversion: the running text as the archive wrote it.
  const legacy = docOf(
    para(text('Brief van '), legacyLink('geheim', 'Het Geheim'), text(' aan '), legacyLink('jan', 'Jan Vermeer')),
    para(text('En '), legacyLink('vernietigd', 'Het Vernietigde'), text(' nog.')),
  );
  entry('brief', 'De brief', { body: legacy, bodyText: 'Brief van Het Geheim aan Jan Vermeer\nEn Het Vernietigde nog.', createdBy: 's58' });
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('brief', 'geheim', 'mention', ''), ('brief', 'jan', 'mention', '')`);
  run(
    `INSERT INTO sections (id, owner_kind, owner_id, title, body, body_text, visibility, sort_order) VALUES ('sec58', 'entry', 'brief', 'Noot', ?, 'Over Het Geheim', 'all', 0)`,
    JSON.stringify(docOf(para(text('Over '), legacyLink('geheim', 'Het Geheim')))),
  );
  run(
    `INSERT INTO cases (id, name, slug, summary, notes, notes_text) VALUES ('d58', 'Dossier', 'd58', '', ?, 'Het Geheim')`,
    JSON.stringify(docOf(para(legacyLink('geheim', 'Het Geheim')))),
  );
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, created_at) VALUES ('rev58', 'brief', ?, 1)`,
    JSON.stringify({ name: 'De brief', body: legacy, bodyText: 'Brief van Het Geheim aan Jan Vermeer' }),
  );
  run(
    `INSERT INTO pending_edits (id, entry_id, proposed_snapshot, proposed_by) VALUES ('pe58', 'brief', ?, 's58')`,
    JSON.stringify({ body: { ...legacy, content: [...legacy.content, para(text('Een regel erbij.'))] } }),
  );
  run(
    `INSERT INTO case_revisions (id, case_id, snapshot) VALUES ('crev58', 'd58', ?)`,
    JSON.stringify({ name: 'Dossier', notes: docOf(para(legacyLink('geheim', 'Het Geheim'))), notesText: 'Het Geheim' }),
  );
  run(`INSERT INTO live_docs (room, state) VALUES ('entry:brief:body', x'00'), ('entry:brief:fields', x'00'), ('entry:jan:body', x'00')`);
  run(`INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES ('brief', 'De brief', '', 'Brief van Het Geheim aan Jan Vermeer', '')`);
});

/* ------------------------------------------------------------ 1. pure */

describe('the shape', () => {
  it('a link is its token in the plain text, and a legacy label is never printed', () => {
    const doc = docOf(para(text('Zie '), { type: 'entryLink', attrs: { handle: 'abcdef123456' } }, text(' en '), legacyLink('x', 'Geheim')));
    expect(docText(doc)).toBe(`Zie ${tokenFor('abcdef123456')} en`);
    expect(linkHandlesIn(doc)).toEqual(['abcdef123456']);
    // A typed ⟦ in the prose never becomes a token.
    expect(docText(docOf(para(text('⟦abcdef123456⟧'))))).toBe('abcdef123456');
  });

  it('mapLinks leaves an untouched document the same object', () => {
    const doc = docOf(para(text('x'), { type: 'entryLink', attrs: { handle: 'abcdef123456' } }));
    const same = mapLinks(doc, (node) => node);
    expect(same.changed).toBe(false);
    expect(same.doc).toBe(doc);
    expect(mapLinks(doc, () => null).changed).toBe(true);
  });
});

/* ------------------------------------------------------- 2. migration */

describe('0035_de_lopende_tekst', () => {
  it('is appended after 0034 and carries its step in JavaScript', () => {
    // Later rounds append after it (0036, 0037), so it is found by name.
    const all = deps.MIGRATIONS as { name: string; run?: unknown }[];
    const at = all.findIndex((m) => m.name === '0035_de_lopende_tekst');
    expect(at).toBeGreaterThan(0);
    expect(typeof all[at].run).toBe('function');
    expect(all[at - 1].name).toBe('0034_een_id');
  });

  it('turns every link into a handle — the id was there — and leaves no name or id in the document', () => {
    const result = deps.upgradeDocs(deps.sqlite);
    expect(result.links).toBeGreaterThanOrEqual(2);
    expect(result.dropped).toBeGreaterThanOrEqual(1);
    const raw = one<{ body: string; body_text: string }>(`SELECT body, body_text FROM entries WHERE id = 'brief'`);
    for (const leak of ['Het Geheim', 'geheim', 'Jan Vermeer', 'label', '"id"', 'slug', 'Vernietigde']) expect(raw.body).not.toContain(leak);
    const handles = linkHandlesIn(JSON.parse(raw.body));
    expect(handles).toHaveLength(2);
    const targets = handles.map((h) => one<{ entry_id: string }>('SELECT entry_id FROM mention_handles WHERE handle = ?', h).entry_id);
    expect(targets).toEqual(['geheim', 'jan']);
    // The plain text beside it: tokens, no names.
    expect(raw.body_text).not.toContain('Geheim');
    expect(handlesIn(raw.body_text)).toEqual(handles);
    // The derived tables still say what the text names.
    expect(deps.docRefs.linkedEntryIds(JSON.parse(raw.body))).toEqual(['geheim', 'jan']);
  });

  it('converts the sections, the notes and every copy, and forgets the rooms of what changed', () => {
    const section = one<{ body: string; body_text: string }>(`SELECT body, body_text FROM sections WHERE id = 'sec58'`);
    expect(section.body).not.toContain('Geheim');
    expect(section.body_text).not.toContain('Geheim');
    const notes = one<{ notes: string; notes_text: string }>(`SELECT notes, notes_text FROM cases WHERE id = 'd58'`);
    expect(notes.notes).not.toContain('Geheim');
    expect(notes.notes_text).not.toContain('Geheim');
    const rev = one<{ snapshot: string }>(`SELECT snapshot FROM entry_revisions WHERE id = 'rev58'`).snapshot;
    expect(rev).not.toContain('Geheim');
    expect(JSON.parse(rev).bodyText).toContain('⟦');
    expect(one<{ s: string }>(`SELECT proposed_snapshot AS s FROM pending_edits WHERE id = 'pe58'`).s).not.toContain('Geheim');
    expect(one<{ s: string }>(`SELECT snapshot AS s FROM case_revisions WHERE id = 'crev58'`).s).not.toContain('Geheim');
    expect(one(`SELECT room FROM live_docs WHERE room = 'entry:brief:body'`)).toBeUndefined();
    // A room whose text did not change keeps its state, and so do the fields rooms.
    expect(one(`SELECT room FROM live_docs WHERE room = 'entry:jan:body'`)).toBeTruthy();
    expect(one(`SELECT room FROM live_docs WHERE room = 'entry:brief:fields'`)).toBeTruthy();
  });

  it('rewrites the search index without the names behind the chips', () => {
    const fts = one<{ body_text: string }>(`SELECT body_text FROM entries_fts WHERE entry_id = 'brief'`);
    expect(fts.body_text).not.toContain('Geheim');
    expect(fts.body_text).not.toContain('⟦');
    expect(fts.body_text).toContain('Brief van');
  });

  it('is idempotent: a second run finds nothing and mints nothing', () => {
    const handles = one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n;
    const body = one<{ body: string }>(`SELECT body FROM entries WHERE id = 'brief'`).body;
    expect(deps.upgradeDocs(deps.sqlite)).toEqual({ docs: 0, links: 0, dropped: 0 });
    expect(one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n).toBe(handles);
    expect(one<{ body: string }>(`SELECT body FROM entries WHERE id = 'brief'`).body).toBe(body);
  });
});

/* ------------------------------------------------------- 3. per reader */

describe('per reader', () => {
  it('a speler gets no name and no id of the hidden artikel; the Keeper gets both', () => {
    const bodyText = one<{ body_text: string }>(`SELECT body_text FROM entries WHERE id = 'brief'`).body_text;
    const [secret, jan] = handlesIn(bodyText);
    const map = deps.refs.shortChipsFor(SPELER, [bodyText]);
    expect(map[secret]).toBeNull();
    expect(map[jan]?.name).toBe('Jan Vermeer');
    const wire = JSON.stringify(map);
    expect(wire).not.toContain('Geheim');
    expect(wire).not.toContain('geheim');
    expect(deps.refs.plainShort(SPELER, bodyText)).toBe('Brief van aan Jan Vermeer\nEn nog.');
    expect(deps.refs.plainShort(KEEPER, bodyText)).toContain('Brief van Het Geheim aan Jan Vermeer');
  });

  it('a rename is the new name at once, for every reader who may see it', () => {
    const [, jan] = handlesIn(one<{ body_text: string }>(`SELECT body_text FROM entries WHERE id = 'brief'`).body_text);
    run(`UPDATE entries SET name = 'Jan de Visser' WHERE id = 'jan'`);
    expect(deps.refs.resolveHandles(SPELER, [jan]).get(jan)?.name).toBe('Jan de Visser');
    run(`UPDATE entries SET name = 'Jan Vermeer' WHERE id = 'jan'`);
  });

  it('a proposal reads as this reviewer may read it', () => {
    const rows = deps.review.listPendingEdits('brief', SPELER);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('Geheim');
    expect(JSON.stringify(deps.review.listPendingEdits('brief', KEEPER))).toContain('Het Geheim');
  });
});

/* --------------------------------------------------------- 4. writing */

describe('cleanDocRefs — the write road', () => {
  it('what a speler could not see and left out comes back where it stood', () => {
    const [secret] = linkHandlesIn(bodyOf('brief'));
    // The speler's editor showed nothing there, and they rewrote the line.
    const theirs = docOf(para(text('Brief van aan '), { type: 'entryLink', attrs: { handle: linkHandlesIn(bodyOf('brief'))[1] } }, text(' — gelezen.')));
    const result = deps.entries.updateEntry('brief', { body: theirs }, SPELER_AUTHOR);
    expect(result.status).toBe('saved');
    const stored = bodyOf('brief');
    expect(linkHandlesIn(stored)).toContain(secret);
    // After "Brief van ", as it stood.
    const line = stored.content[0].content;
    expect(line[0]).toEqual(text('Brief van '));
    expect(line[1]).toEqual({ type: 'entryLink', attrs: { handle: secret } });
    // The Keeper sees it, so the Keeper may take it out.
    deps.entries.updateEntry('brief', { body: docOf(para(text('Leeg.'))) }, { ...KEEPER, characterId: null });
    expect(linkHandlesIn(bodyOf('brief'))).toEqual([]);
    expect(one<{ n: number }>(`SELECT count(*) AS n FROM entry_links WHERE from_entry_id = 'brief'`).n).toBe(0);
  });

  it('a new link is a handle this hand may name; an id or a stranger’s handle is not', () => {
    const secretHandle = deps.refs.mintHandle('geheim', KEEPER)!;
    const doc = docOf(
      para(
        text('A '),
        legacyLink('jan', 'Jan Vermeer'),
        text(' B '),
        legacyLink('geheim', 'Het Geheim'),
        text(' C '),
        { type: 'entryLink', attrs: { handle: secretHandle } },
        { type: 'entryLink', attrs: { handle: 'bestaatniet12' } },
      ),
    );
    deps.entries.updateEntry('brief', { body: doc }, SPELER_AUTHOR);
    const stored = bodyOf('brief');
    const handles = linkHandlesIn(stored);
    expect(handles).toHaveLength(1);
    expect(one<{ entry_id: string }>('SELECT entry_id FROM mention_handles WHERE handle = ?', handles[0]).entry_id).toBe('jan');
    expect(JSON.stringify(stored)).not.toContain('Geheim');
    expect(JSON.stringify(stored)).not.toContain('label');
    // `entry_links` follows: Genoemd in still names Jan.
    expect(deps.sqlite.prepare(`SELECT to_entry_id FROM entry_links WHERE from_entry_id = 'brief'`).all()).toEqual([{ to_entry_id: 'jan' }]);
  });

  it('the Keeper writing an id gets a handle, and the stored body is `{ handle }` only', () => {
    deps.entries.updateEntry('brief', { body: docOf(para(text('Over '), legacyLink('geheim', 'Het Geheim'), text(' en meer'))) }, { ...KEEPER, characterId: null });
    const stored = bodyOf('brief');
    expect(stored.content[0].content[1]).toEqual({ type: 'entryLink', attrs: { handle: expect.stringMatching(/^[A-Za-z0-9]{12}$/) } });
  });

  it('a proposal keeps what the proposer could not see', () => {
    const [secret] = linkHandlesIn(bodyOf('brief'));
    run(`UPDATE entries SET is_locked = 1 WHERE id = 'brief'`);
    const result = deps.entries.updateEntry('brief', { body: docOf(para(text('Mijn versie.'))) }, SPELER_AUTHOR);
    expect(result.status).toBe('pending');
    const proposal = one<{ s: string }>(`SELECT proposed_snapshot AS s FROM pending_edits WHERE proposed_by = 's58' ORDER BY rowid DESC LIMIT 1`).s;
    expect(linkHandlesIn(JSON.parse(proposal).body)).toEqual([secret]);
    expect(proposal).not.toContain('Geheim');
    run(`UPDATE entries SET is_locked = 0 WHERE id = 'brief'`);
  });
});

/* ---------------------------------------------------------- 5. search */

describe('search', () => {
  it('a hidden name finds nothing for a speler; a visible one finds who names it', () => {
    deps.entries.updateEntry(
      'brief',
      { body: docOf(para(text('Brief van '), legacyLink('geheim', 'Het Geheim'), text(' aan '), legacyLink('jan', 'Jan Vermeer'))) },
      { ...KEEPER, characterId: null },
    );
    const fts = one<{ body_text: string }>(`SELECT body_text FROM entries_fts WHERE entry_id = 'brief'`).body_text;
    expect(fts).not.toContain('Geheim');
    const asSpeler = deps.search.searchEntries({ ...SPELER, side: 'player' }, 'Geheim');
    expect([...asSpeler.names, ...asSpeler.bodies].map((e) => e.id)).toEqual([]);
    const jan = deps.search.searchEntries({ ...SPELER, side: 'player' }, 'Vermeer');
    expect(jan.names.map((e) => e.id)).toEqual(['jan']);
    expect(jan.bodies.map((e) => e.id)).toContain('brief');
  });
});

/* --------------------------------------------------------- 6. restore */

describe('scripts/restore.mjs', () => {
  it('opens a backup from before 0035 and converts it the same way', () => {
    // An archive exactly as a pre-0035 backup has it: legacy links in the text,
    // and no 0035 in its migrations.
    run(
      `UPDATE entries SET body = ?, body_text = 'Brief van Het Geheim' WHERE id = 'brief'`,
      JSON.stringify(docOf(para(text('Brief van '), legacyLink('geheim', 'Het Geheim')))),
    );
    const { zip } = deps.buildArchive(deps.sqlite, join(dir, 'assets'));
    const files = [...readZip(zip)].map(([name, data]) => {
      if (name !== 'json/schema_migrations.json') return { name, data };
      const rows = (JSON.parse(data.toString('utf8')) as { name: string }[]).filter((row) => row.name !== '0035_de_lopende_tekst');
      return { name, data: Buffer.from(JSON.stringify(rows), 'utf8') };
    });
    const backup = join(dir, 'oud.zip');
    writeFileSync(backup, createZip(files));

    const target = mkdtempSync(join(tmpdir(), 'zcf-ronde-58-restore-'));
    const root = resolve(__dirname, '../..');
    execFileSync(process.execPath, [join(root, 'scripts', 'restore.mjs'), backup], {
      cwd: root,
      env: { ...process.env, DATA_DIR: target },
      input: 'restore\n',
      encoding: 'utf8',
    });
    const restored = new Database(join(target, 'app.db'), { readonly: true });
    const row = restored.prepare(`SELECT body, body_text FROM entries WHERE id = 'brief'`).get() as { body: string; body_text: string };
    expect(row.body).not.toContain('Geheim');
    expect(row.body).not.toContain('label');
    const [handle] = linkHandlesIn(JSON.parse(row.body));
    expect((restored.prepare('SELECT entry_id FROM mention_handles WHERE handle = ?').get(handle) as { entry_id: string }).entry_id).toBe('geheim');
    expect(row.body_text).not.toContain('Geheim');
    const fts = restored.prepare(`SELECT body_text FROM entries_fts WHERE entry_id = 'brief'`).get() as { body_text: string };
    expect(fts.body_text).not.toContain('Geheim');
    restored.close();
  }, 60_000);
});
