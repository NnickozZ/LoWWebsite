import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * §18b: who wrote it, recorded.
 *
 * The rules under test: the `X-Character` header is never believed, only
 * resolved; a history row keeps the onderzoeker it was written as, so two
 * investigators on one account never merge into one revision; a feed prefers
 * the recorded name and falls back to the account's karakter of the day for
 * every row written before this existed; and a player who has not said who
 * they are writing as does not write, while a Keeper always may.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-authorship-'));
process.env.DATA_DIR = dir;

/** What the request says it is. `vi.hoisted` so the mock factory can see it. */
const wire = vi.hoisted(() => ({ header: null as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(wire.header ? { 'x-character': wire.header } : {}),
  cookies: async () => new Map(),
}));

type Deps = {
  author: typeof import('@/lib/auth/author');
  characters: typeof import('@/lib/characters');
  entries: typeof import('@/lib/entries/service');
  sqlite: typeof import('@/lib/db').sqlite;
};
let deps: Deps;

function user(sqlite: Deps['sqlite'], id: string, name: string, isKeeper = false) {
  sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
       VALUES (?, ?, ?, 'x', 'x', ?)`,
    )
    .run(id, name, name.toLowerCase(), isKeeper ? 1 : 0);
}

function entry(sqlite: Deps['sqlite'], id: string, name: string) {
  sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, visibility, created_by, view_mode, edit_mode)
       VALUES (?, 'character', ?, ?, '{}', 'all', 'bram', 'all', 'all')`,
    )
    .run(id, name, id);
}

function tie(sqlite: Deps['sqlite'], userId: string, entryId: string, order = 0) {
  sqlite
    .prepare('INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES (?, ?, ?)')
    .run(userId, entryId, order);
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    author: await import('@/lib/auth/author'),
    characters: await import('@/lib/characters'),
    entries: await import('@/lib/entries/service'),
    sqlite: dbModule.sqlite,
  };
  const { sqlite } = deps;

  user(sqlite, 'keeper-1', 'Keeper', true);
  user(sqlite, 'bram', 'Bram');
  user(sqlite, 'aagje', 'Aagje');
  // Just arrived, holds nobody: the person the first-artikel door exists for.
  user(sqlite, 'griet', 'Griet');
  // Held one once; it is in the prullenbak, so the knot points at nothing.
  user(sqlite, 'wim', 'Wim');

  entry(sqlite, 'vandijk', 'Onderzoeker Van Dijk');
  entry(sqlite, 'nel', 'Nel de Visser');
  entry(sqlite, 'iris', 'Iris Bouwman');
  entry(sqlite, 'artikel', 'De vuurtoren');
  entry(sqlite, 'weg', 'Jan Verdronken');

  // Bram plays two onderzoekers; Aagje plays one; the Keeper plays nobody.
  tie(sqlite, 'bram', 'vandijk', 0);
  tie(sqlite, 'bram', 'nel', 1);
  tie(sqlite, 'aagje', 'iris', 0);
  tie(sqlite, 'wim', 'weg', 0);
  sqlite.prepare("UPDATE users SET active_character_id = 'vandijk' WHERE id = 'bram'").run();
  sqlite.prepare("UPDATE entries SET deleted_at = 1 WHERE id = 'weg'").run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the header is never believed', () => {
  it('resolves a fiche this account holds, and nothing else', () => {
    const { resolveCharacter } = deps.author;
    expect(resolveCharacter('bram', 'vandijk')).toBe('vandijk');
    expect(resolveCharacter('bram', 'nel')).toBe('nel');
    // Aagje's onderzoeker, asked for by Bram's window.
    expect(resolveCharacter('bram', 'iris')).toBeNull();
    // A fiche nobody tied on at all.
    expect(resolveCharacter('bram', 'artikel')).toBeNull();
    // Nothing asked for.
    expect(resolveCharacter('bram', null)).toBeNull();
    expect(resolveCharacter('bram', '')).toBeNull();
  });

  it('a Keeper is always the Keeper, whatever the header says', () => {
    expect(deps.author.resolveCharacter('keeper-1', 'vandijk')).toBeNull();
  });

  it('an account that does not exist resolves to nobody', () => {
    expect(deps.author.resolveCharacter('niemand', 'vandijk')).toBeNull();
  });

  it('reads the header, and refuses anything that is not an id', async () => {
    const { readCharacterHeader } = deps.author;
    wire.header = 'vandijk';
    expect(await readCharacterHeader()).toBe('vandijk');
    wire.header = '  vandijk  ';
    expect(await readCharacterHeader()).toBe('vandijk');
    wire.header = "vandijk' OR 1=1";
    expect(await readCharacterHeader()).toBeNull();
    wire.header = 'x'.repeat(200);
    expect(await readCharacterHeader()).toBeNull();
    wire.header = '';
    expect(await readCharacterHeader()).toBeNull();
    wire.header = null;
    expect(await readCharacterHeader()).toBeNull();
  });
});

describe('a player who has not chosen does not write', () => {
  it('refuses a player with no onderzoeker', () => {
    expect(() => deps.author.requireAuthor({ isKeeper: false, characterId: null })).toThrow(
      /Kies eerst met wie je schrijft/,
    );
    expect(() => deps.author.requireAuthor({ isKeeper: false })).toThrow(/Kies eerst/);
  });

  it('lets a player with one through, and a Keeper always', () => {
    expect(() => deps.author.requireAuthor({ isKeeper: false, characterId: 'vandijk' })).not.toThrow();
    expect(() => deps.author.requireAuthor({ isKeeper: true, characterId: null })).not.toThrow();
  });

  it('says so as the app says everything else: a plain refusal with a Dutch sentence', () => {
    try {
      deps.author.requireAuthor({ isKeeper: false, characterId: null });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(deps.author.NoAuthorError);
      expect((err as Error).message).toBe('Kies eerst met wie je schrijft.');
    }
  });

  /*
   * §18b's chicken and egg: an onderzoeker is an artikel somebody tied on, so
   * the very first artikel has to be writable by somebody who has nobody to
   * write as. `POST /api/entries` is the one road that opens, and it opens
   * only while the wardrobe is empty.
   */
  describe('the first artikel, and only the first', () => {
    const gate = () => deps.author.requireAuthorOrFirstCharacter;

    it('lets a speler with no onderzoeker at all through', () => {
      expect(() => gate()({ id: 'griet', isKeeper: false, characterId: null })).not.toThrow();
      expect(() => gate()({ id: 'griet', isKeeper: false })).not.toThrow();
    });

    it('refuses a speler who holds one and has not said they are writing as it', () => {
      expect(() => gate()({ id: 'aagje', isKeeper: false, characterId: null })).toThrow(
        /Kies eerst met wie je schrijft/,
      );
      try {
        gate()({ id: 'aagje', isKeeper: false, characterId: null });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(deps.author.NoAuthorError);
      }
    });

    it('is the ordinary rule for everyone who has said', () => {
      expect(() => gate()({ id: 'bram', isKeeper: false, characterId: 'nel' })).not.toThrow();
    });

    it('a Keeper passes, as a Keeper passes everything of this kind', () => {
      expect(() => gate()({ id: 'keeper-1', isKeeper: true, characterId: null })).not.toThrow();
    });

    it('counts the karakters the person can actually see, not the knots', () => {
      // Wim's only fiche is in the prullenbak: the tie row is still there, and
      // a bare count of it would leave him locked out of the one road he has.
      expect(deps.characters.listCharacters('wim')).toHaveLength(0);
      expect(() => gate()({ id: 'wim', isKeeper: false, characterId: null })).not.toThrow();
    });
  });

  it('`hasAuthor` is the same question, for a page that only wants to know', () => {
    expect(deps.author.hasAuthor(null)).toBe(false);
    expect(deps.author.hasAuthor({ isKeeper: false, characterId: null })).toBe(false);
    expect(deps.author.hasAuthor({ isKeeper: false, characterId: 'nel' })).toBe(true);
    expect(deps.author.hasAuthor({ isKeeper: true, characterId: null })).toBe(true);
  });
});

describe('a revision keeps the onderzoeker who wrote it', () => {
  const revisions = () =>
    deps.sqlite
      .prepare('SELECT edited_by, character_id FROM entry_revisions WHERE entry_id = ? ORDER BY rowid')
      .all('artikel') as { edited_by: string; character_id: string | null }[];

  it('two onderzoekers of one account never merge into one revision', () => {
    deps.entries.writeRevision('artikel', 'bram', '', 'vandijk');
    // The same person, the same minute — but a different name at the top of it.
    deps.entries.writeRevision('artikel', 'bram', '', 'nel');
    expect(revisions()).toEqual([
      { edited_by: 'bram', character_id: 'vandijk' },
      { edited_by: 'bram', character_id: 'nel' },
    ]);
  });

  it('the same onderzoeker typing on still coalesces', () => {
    deps.entries.writeRevision('artikel', 'bram', '', 'nel');
    deps.entries.writeRevision('artikel', 'bram', '', 'nel');
    expect(revisions()).toHaveLength(2);
  });

  it('and a row from before §18b does not merge with one that has a name', () => {
    deps.entries.writeRevision('artikel', 'bram', '', null);
    expect(revisions()).toHaveLength(3);
    expect(revisions()[2]).toEqual({ edited_by: 'bram', character_id: null });
  });
});

describe('what the archive prints', () => {
  it('prefers the onderzoeker the row recorded', () => {
    const feed = deps.characters.attributed([
      { id: 1, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false, characterId: 'nel' },
      { id: 2, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false, characterId: 'vandijk' },
    ]);
    // One account, one feed, two names — which is the whole point.
    expect(feed.map((row) => row.actorLabel)).toEqual(['Nel de Visser', 'Onderzoeker Van Dijk']);
    expect(feed.every((row) => row.actorAccount === 'Bram')).toBe(true);
  });

  it('falls back to the karakter of the day for a row that recorded none', () => {
    const [row] = deps.characters.attributed([
      { id: 1, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false, characterId: null },
    ]);
    expect(row.actorLabel).toBe('Onderzoeker Van Dijk');
  });

  it('a switch no longer re-labels what was recorded, only what was not', () => {
    const rows = [
      { id: 1, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false, characterId: 'nel' },
      { id: 2, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false, characterId: null },
    ];
    expect(deps.characters.attributed(rows).map((r) => r.actorLabel)).toEqual([
      'Nel de Visser',
      'Onderzoeker Van Dijk',
    ]);
    deps.sqlite.prepare("UPDATE users SET active_character_id = 'nel' WHERE id = 'bram'").run();
    expect(deps.characters.attributed(rows).map((r) => r.actorLabel)).toEqual([
      // Recorded: unmoved.
      'Nel de Visser',
      // Not recorded: still the karakter of the day.
      'Nel de Visser',
    ]);
    deps.sqlite.prepare("UPDATE users SET active_character_id = 'vandijk' WHERE id = 'bram'").run();
  });

  it('a Keeper is the Keeper, whatever a row happens to carry', () => {
    const [row] = deps.characters.attributed(
      [{ id: 1, actorId: 'keeper-1', actorName: 'Keeper', actorIsKeeper: true, characterId: 'nel' }],
      'Spelleider',
    );
    expect(row.actorLabel).toBe('Spelleider');
  });

  it('a fiche in the bin has no name to print, so the account answers', () => {
    deps.sqlite.prepare("UPDATE entries SET deleted_at = 1 WHERE id = 'iris'").run();
    const [row] = deps.characters.attributed([
      { id: 1, actorId: 'aagje', actorName: 'Aagje', actorIsKeeper: false, characterId: 'iris' },
    ]);
    expect(row.actorLabel).toBe('Aagje');
    deps.sqlite.prepare("UPDATE entries SET deleted_at = NULL WHERE id = 'iris'").run();
  });

  it('`displayNames` reads a recorded id too', () => {
    const names = deps.characters.displayNames([
      { id: 'bram', username: 'Bram', isKeeper: false, characterId: 'nel' },
      { id: 'aagje', username: 'Aagje', isKeeper: false },
    ]);
    expect(names.get('bram')).toEqual({ label: 'Nel de Visser', account: 'Bram' });
    // Aagje wears nobody, and recorded nobody: her account name it is.
    expect(names.get('aagje')).toEqual({ label: 'Aagje', account: 'Aagje' });
  });

  it('the live layer is the window, not the account', () => {
    const { windowPresenceName } = deps.characters;
    // Two windows of one account, each with its own onderzoeker.
    expect(windowPresenceName({ id: 'bram', username: 'Bram', isKeeper: false, characterId: 'nel' })).toBe(
      'Nel de Visser',
    );
    expect(
      windowPresenceName({ id: 'bram', username: 'Bram', isKeeper: false, characterId: 'vandijk' }),
    ).toBe('Onderzoeker Van Dijk');
    // A Keeper is their account name on a strip, however the word is set.
    expect(
      windowPresenceName({ id: 'keeper-1', username: 'Keeper', isKeeper: true, characterId: null }, 'Spelleider'),
    ).toBe('Keeper');
  });
});
