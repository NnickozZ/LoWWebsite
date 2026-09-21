import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * §89, ronde 50: de sloten.
 *
 * One file for the round's locks, each asked the way an attacker would ask it
 * — a signed-out reader, a speler with a hand-built request, a guessed id —
 * and against a real SQLite file where the question is about SQL. The last
 * block reads the source tree itself, because two of the locks are *shapes*
 * of the code ("every page asks for a viewer", "no server action nobody
 * imports") and the only way to keep a shape is to measure it.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-sloten-'));
process.env.DATA_DIR = dir;

const ROOT = join(__dirname, '..', '..');

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  entries: typeof import('@/lib/entries/service');
  access: typeof import('@/lib/access');
  visibility: typeof import('@/lib/entries/visibility');
  mentions: typeof import('@/lib/entries/mentions');
  cases: typeof import('@/lib/cases/service');
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true, characterId: null };
const BRAM = { id: 'bram', isKeeper: false, characterId: null };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    entries: await import('@/lib/entries/service'),
    access: await import('@/lib/access'),
    visibility: await import('@/lib/entries/visibility'),
    mentions: await import('@/lib/entries/mentions'),
    cases: await import('@/lib/cases/service'),
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
  const entry = (id: string, name: string, visibility: string) =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  entry('e-open', 'De Vuurtoren', 'all');
  entry('e-geheim', 'Dokter Verhoeven', 'keeper');
  entry('e-herschreven', 'De brief', 'all');
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-open', 'Zaak open', 'c-open', 'keeper-1', 'all')`);

  // An artikel with a past: one version written while it was the Keeper's,
  // one after it was handed to the table.
  const snap = (visibility: string, text: string) =>
    JSON.stringify({ name: 'De brief', shortDescription: '', body: null, bodyText: text, fields: {}, tags: [], visibility });
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, created_at) VALUES ('r-geheim', 'e-herschreven', ?, 'keeper-1', 100)`,
    snap('keeper', 'De moordenaar is de dokter.'),
  );
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, created_at) VALUES ('r-open', 'e-herschreven', ?, 'keeper-1', 200)`,
    snap('all', 'Een brief, gevonden in de vuurtoren.'),
  );
  // A version from before `visibility` was recorded at all is the table's.
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, created_at) VALUES ('r-oud', 'e-herschreven', ?, 'keeper-1', 50)`,
    JSON.stringify({ name: 'De brief', bodyText: 'oud' }),
  );
});

/* ================================================ 1. uitgelogd is niemand */

describe('§89: a signed-out reader sees nothing', () => {
  it('matches no artikel in SQL, not even one shared with everyone', () => {
    expect(deps.entries.browseEntries(null, { bothSides: true })).toEqual([]);
    expect(deps.entries.getEntryBySlug('e-open', null)).toBeUndefined();
    expect(deps.entries.getEntryBySlug('e-open', BRAM)?.id).toBe('e-open');
  });

  it('matches no dossier either', () => {
    expect(deps.cases.getCaseBySlug('c-open', null)).toBeUndefined();
    expect(deps.cases.getCaseBySlug('c-open', BRAM)?.id).toBe('c-open');
  });

  it('is refused by every in-memory predicate', () => {
    const open = { createdBy: 'keeper-1', viewMode: 'all' as const, editMode: 'all' as const };
    expect(deps.access.canView(open, null)).toBe(false);
    expect(deps.access.canEdit(open, null)).toBe(false);
    expect(deps.visibility.canSeeEntry({ visibility: 'all' }, null)).toBe(false);
    expect(deps.visibility.canSeeSection({ visibility: 'all' }, null)).toBe(false);
  });
});

/* =============================================== 2. een Keeper-tijdperk */

describe('§89: a version from the Keeper side does not exist for a speler', () => {
  it('is not in the history a speler is handed — no row, no id', () => {
    const ids = deps.entries.listRevisions('e-herschreven', false).map((r) => r.id);
    expect(ids).toContain('r-open');
    expect(ids).toContain('r-oud');
    expect(ids).not.toContain('r-geheim');
    expect(JSON.stringify(deps.entries.listRevisions('e-herschreven', false))).not.toContain('dokter');
    expect(deps.entries.listRevisions('e-herschreven', true).map((r) => r.id)).toContain('r-geheim');
  });

  it('is not there by id either', () => {
    expect(deps.entries.getRevision('r-geheim')).toBeUndefined();
    expect(deps.entries.getRevision('r-geheim', false)).toBeUndefined();
    expect(deps.entries.getRevision('r-geheim', true)?.id).toBe('r-geheim');
    expect(deps.entries.getRevision('r-open', false)?.id).toBe('r-open');
  });

  it('cannot be put back by a speler who may edit the artikel — the same sentence a made-up id gets', () => {
    expect(deps.access.viewerCanEdit('entry', 'e-herschreven', BRAM)).toBe(true);
    expect(() => deps.entries.restoreRevision('r-geheim', BRAM)).toThrow('Versie niet gevonden');
    expect(() => deps.entries.restoreRevision('r-bestaat-niet', BRAM)).toThrow('Versie niet gevonden');
    const row = deps.sqlite.prepare(`SELECT body_text FROM entries WHERE id = 'e-herschreven'`).get() as {
      body_text: string;
    };
    expect(row.body_text).not.toContain('dokter');
  });
});

/* ======================================= 3. de prullenbak is van de Keeper */

describe('§89: no road out of the prullenbak but the Keeper’s', () => {
  it('has no `restoreEntry` in the service any more', () => {
    expect('restoreEntry' in deps.entries).toBe(false);
  });
});

/* ================================================= 4. een @ is geen orakel */

describe('§89: a name a speler may not see is not confirmed by a chip', () => {
  it('drops an @ on a Keeper-only artikel whole', () => {
    expect(deps.mentions.resolveMentions(BRAM, ['@Dokter Verhoeven'])).toEqual([[]]);
    // …which is exactly what a name that matches nothing gives.
    expect(deps.mentions.resolveMentions(BRAM, ['@Dokter Niemand'])).toEqual([[]]);
  });

  it('keeps a bracketed one as the dead chip a typo also is', () => {
    const [spans] = deps.mentions.resolveMentions(BRAM, ['[[Dokter Verhoeven]]']);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ entryId: null, slug: null });
    const [typo] = deps.mentions.resolveMentions(BRAM, ['[[Dokter Niemand]]']);
    expect(typo[0]).toMatchObject({ entryId: null, slug: null });
  });

  it('still gives a Keeper, and a visible name, the chip', () => {
    expect(deps.mentions.resolveMentions(KEEPER, ['@Dokter Verhoeven'])[0][0]?.entryId).toBe('e-geheim');
    expect(deps.mentions.resolveMentions(BRAM, ['@De Vuurtoren'])[0][0]?.entryId).toBe('e-open');
  });
});

/* ======================================================== 5. terug, veilig */

describe('§89: safeReturnPath', () => {
  it('sends anything that could leave the archive home', async () => {
    const { safeReturnPath } = await import('@/lib/auth/paths');
    for (const bad of ['/\\evil.example', '//evil.example', '/\t/evil', 'https://evil.example', 'javascript:alert(1)', '', null]) {
      expect(safeReturnPath(bad as string | null), String(bad)).toBe('/');
    }
    expect(safeReturnPath('/e/de-brief?rev=r1#geschiedenis')).toBe('/e/de-brief?rev=r1#geschiedenis');
    expect(safeReturnPath('/%5Cevil')).toBe('/%5Cevil');
  });
});

/* ====================================================== 6. schone documenten */

describe('§89: cleanDoc', () => {
  const doc = (content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

  it('takes the link off a javascript: href and keeps the words', async () => {
    const { cleanDoc } = await import('@/lib/entries/doc');
    const out = cleanDoc(doc([{ type: 'text', text: 'klik', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }]));
    expect(JSON.stringify(out)).not.toContain('javascript');
    expect(JSON.stringify(out)).toContain('klik');
    for (const href of [' JaVaScRiPt:x', 'data:text/html,x', '//evil.example', 'vbscript:x']) {
      expect(JSON.stringify(cleanDoc(doc([{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }])))).not.toContain('link');
    }
  });

  it('removes a picture from anywhere but this archive, and keeps an upload', async () => {
    const { cleanDoc } = await import('@/lib/entries/doc');
    const out = cleanDoc({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://evil.example/pixel.gif?wie=bram' } },
        { type: 'image', attrs: { src: '/api/assets/abc123' } },
        { type: 'image', attrs: { src: 'http://archief.example/api/assets/abc123?s=card' } },
      ],
    }) as { content: { attrs: { src: string } }[] };
    expect(out.content.map((n) => n.attrs.src)).toEqual(['/api/assets/abc123', '/api/assets/abc123?s=card']);
  });

  it('keeps nothing but six hex digits in a chip colour', async () => {
    const { cleanDoc } = await import('@/lib/entries/doc');
    const out = cleanDoc(
      doc([{ type: 'entryLink', attrs: { id: 'e', label: 'x', slug: 'x', icon: 'book', colour: 'red;background:url(//evil)' } }]),
    );
    expect(JSON.stringify(out)).not.toContain('evil');
  });

  it('hands a clean document back byte for byte, so the live layer never resets one for nothing', async () => {
    const { cleanDoc } = await import('@/lib/entries/doc');
    const clean = doc([
      { type: 'text', text: 'zie ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'hier', marks: [{ type: 'link', attrs: { href: 'https://example.org', target: '_blank' } }] },
      { type: 'entryLink', attrs: { id: 'e-open', label: 'De Vuurtoren', slug: 'e-open', icon: '', colour: '' } },
    ]);
    expect(JSON.stringify(cleanDoc(clean))).toBe(JSON.stringify(clean));
  });
});

/* ======================================================= 7. fouten zwijgen */

describe('§89: apiError says nothing about the database', () => {
  it('passes a refusal written for a person, and nothing else', async () => {
    const { apiError } = await import('@/lib/api');
    const said = async (err: unknown) => {
      const res = apiError(err);
      return { status: res.status, body: (await res.json()) as { error: string } };
    };
    expect(await said(new Error('Je mag dit dossier niet bewerken.'))).toEqual({
      status: 400,
      body: { error: 'Je mag dit dossier niet bewerken.' },
    });
    class SqliteError extends Error {}
    const leaked = await said(new SqliteError('UNIQUE constraint failed: entries.slug'));
    expect(leaked.status).toBe(500);
    expect(JSON.stringify(leaked.body)).not.toContain('entries.slug');
    const syntax = await said(new SyntaxError('Unexpected token < in JSON at position 0'));
    expect(syntax.status).toBe(400);
    expect(JSON.stringify(syntax.body)).not.toContain('Unexpected');
  });
});

/* ====================================================== 8. wie klopt er */

describe('§89: clientIp believes a header only behind a trusted proxy', () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it('ignores X-Forwarded-For without TRUST_PROXY', async () => {
    const { clientIp } = await import('@/lib/auth/ratelimit');
    expect(clientIp(new Headers({ 'x-forwarded-for': '10.0.0.7' }))).toBe('direct');
  });

  it('reads the hop the proxy wrote — the last — with it', async () => {
    const { clientIp } = await import('@/lib/auth/ratelimit');
    process.env.TRUST_PROXY = '1';
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('counts a bucket of its own size', async () => {
    const { rateLimit, isLimited } = await import('@/lib/auth/ratelimit');
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, { max: 3 }).ok).toBe(true);
    expect(isLimited(key, { max: 3 }).ok).toBe(false);
    expect(rateLimit(key, { max: 3 }).ok).toBe(false);
  });
});

/* ================================================ 9. geen leesbaar wachtwoord */

describe('§89: no password can be read back', () => {
  it('has no column for it', () => {
    const columns = (deps.sqlite.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('password_hash');
    expect(columns).not.toContain('password_enc');
  });

  it('has no function that could make one', async () => {
    const password = await import('@/lib/auth/password.mjs');
    expect('encryptPassword' in password).toBe(false);
    expect('decryptPassword' in password).toBe(false);
  });

  it('keeps a hash of nothing to spend the same time on an unknown name', async () => {
    const { decoyPasswordHash, verifyPassword } = await import('@/lib/auth/password.mjs');
    const hash = await decoyPasswordHash();
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'wachtwoord')).toBe(false);
    expect(await decoyPasswordHash()).toBe(hash);
  });

  it('compares an invite code without saying how long it is', async () => {
    const { constantTimeEqual } = await import('@/lib/auth/password.mjs');
    expect(constantTimeEqual('ABCDE-FGHJK', 'ABCDE-FGHJK')).toBe(true);
    expect(constantTimeEqual('A', 'ABCDE-FGHJK')).toBe(false);
  });
});

/* ======================================================= 10. de vorm van de code */

function walk(from: string, match: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(from)) {
    const path = join(from, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match(path)) out.push(path);
  }
  return out;
}

describe('§89: the shape of the code', () => {
  it('opens every page under app/(app) with requireViewer', () => {
    const pages = walk(join(ROOT, 'app', '(app)'), (p) => p.endsWith('page.tsx'));
    expect(pages.length).toBeGreaterThan(20);
    const missing = pages.filter((p) => !readFileSync(p, 'utf8').includes('await requireViewer()'));
    expect(missing.map((p) => relative(ROOT, p))).toEqual([]);
  });

  it('has no server action that nothing imports — an exported action is an endpoint', () => {
    const sources = [
      ...walk(join(ROOT, 'app'), (p) => /\.(ts|tsx)$/.test(p)),
      ...walk(join(ROOT, 'components'), (p) => /\.(ts|tsx)$/.test(p)),
      ...walk(join(ROOT, 'lib'), (p) => /\.(ts|tsx)$/.test(p)),
    ];
    const text = new Map(sources.map((p) => [p, readFileSync(p, 'utf8')]));
    const unused: string[] = [];
    for (const [file, body] of text) {
      if (!/^['"]use server['"]/m.test(body)) continue;
      for (const [, name] of body.matchAll(/export async function (\w+)/g)) {
        const used = [...text].some(([other, otherBody]) => other !== file && new RegExp(`\\b${name}\\b`).test(otherBody));
        if (!used) unused.push(`${relative(ROOT, file)} :: ${name}`);
      }
    }
    expect(unused).toEqual([]);
  });

  it('keeps the voordeur in front of everything but the two doors', () => {
    const middleware = readFileSync(join(ROOT, 'middleware.ts'), 'utf8');
    expect(middleware).toContain("'/login'");
    expect(middleware).toContain("'/signup'");
    expect(middleware).toContain('sec-fetch-site');
  });
});
