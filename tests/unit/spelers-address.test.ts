import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §77: an account, as an address.
 *
 * `lib/spelers/service.ts` turns a username into the segment of a URL, and it
 * does so **without a column**: the slug is computed on every read. §4 lets a
 * username hold spaces, apostrophes and any unicode letter — "Jan Willem",
 * "Van 't Hoff" — and none of those may appear in a path segment or in a live
 * key (`isWellFormedKey`), so something has to map one to the other.
 *
 * The file's own docblock makes two promises that this pins down, because both
 * are the kind that stops being true in silence:
 *
 *   1. **two names that slugify the same cannot both answer to one slug.** The
 *      whole list is computed in one ordered pass so `uniqueSlug` can hand the
 *      second one `-2`; a per-account shortcut would give both the same
 *      address and one of them would open the other's page.
 *   2. **every road in or out goes through `listSpelers`.** The page, the
 *      roster (§76) and the link all have to agree about who `jan-piet` is, so
 *      the roundtrip is asserted in both directions for every account.
 *
 * Asked of a real SQLite file, because the ordering that makes promise 1 hold
 * is `ORDER BY username_lower` in SQLite's own collation, not in JavaScript's.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-spelers-'));
process.env.DATA_DIR = dir;

type Spelers = typeof import('@/lib/spelers/service');
type Keys = typeof import('@/lib/live/keys');
let spelers: Spelers;
let keys: Keys;
let gate: typeof import('@/lib/live/gate');
let sqlite: typeof import('@/lib/db').sqlite;

const AS = { id: 'bram', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  spelers = await import('@/lib/spelers/service');
  keys = await import('@/lib/live/keys');
  gate = await import('@/lib/live/gate');

  const add = (id: string, username: string, keeper = 0, disabled = 0) =>
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, is_keeper, is_disabled)
         VALUES (?, ?, ?, 'x', ?, ?)`,
      )
      .run(id, username, username.toLowerCase(), keeper, disabled);

  add('keeper-1', 'Keeper', 1);
  add('bram', 'Bram', 0);
  // §4's awkward names: a space, an apostrophe, a diacritic, a capital IJ.
  add('janwillem', 'Jan Willem');
  add('hoff', "Van 't Hoff");
  add('aero', 'Aagje Ærø');
  add('ijs', 'IJsbrand');
  // And a name `slugify` cannot transliterate at all, which still needs a door.
  add('kanji', '漢字');
  // The pair that collides: two different people, one slug between them.
  add('jan-piet-1', 'Jan Piet');
  add('jan-piet-2', 'Jan-Piet');
  // Somebody the archive has switched off.
  add('weg', 'Weggestuurd', 0, 1);
});

describe('§77: one list, one answer', () => {
  it('gives every live account a slug that is safe in a path and on the wire', () => {
    const list = spelers.listSpelers();
    expect(list.map((speler) => speler.username)).not.toContain('Weggestuurd');
    for (const speler of list) {
      expect(speler.slug).toMatch(/^[a-z0-9-]{1,64}$/);
      // §21: what may go in a key at all.
      expect(keys.isWellFormedKey(keys.spelerPagePlace(speler.slug))).toBe(true);
      // §77: and what `canWatch` will let a tab stand on.
      expect(gate.canWatch(keys.spelerPagePlace(speler.slug), AS)).toBe(true);
    }
  });

  it('never hands two people the same address', () => {
    const slugs = spelers.listSpelers().map((speler) => speler.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // The colliding pair: ordered by the folded name, so the second is numbered.
    const piet = spelers.listSpelers().filter((speler) => speler.slug.startsWith('jan-piet'));
    expect(piet.map((speler) => speler.slug).sort()).toEqual(['jan-piet', 'jan-piet-2']);
    expect(new Set(piet.map((speler) => speler.id)).size).toBe(2);
  });

  it('is stable: the same list is computed the same way twice', () => {
    expect(spelers.listSpelers()).toEqual(spelers.listSpelers());
  });

  it('roundtrips both ways, for every account', () => {
    for (const speler of spelers.listSpelers()) {
      expect(spelers.spelerBySlug(speler.slug)?.id).toBe(speler.id);
      expect(spelers.spelerById(speler.id)?.slug).toBe(speler.slug);
      expect(spelers.spelerHref(speler.id)).toBe(`/spelers/${speler.slug}`);
    }
  });

  it('transliterates the awkward names rather than refusing them', () => {
    const bySlug = (slug: string) => spelers.spelerBySlug(slug)?.username ?? null;
    expect(bySlug('jan-willem')).toBe('Jan Willem');
    expect(bySlug('van-t-hoff')).toBe("Van 't Hoff");
    expect(bySlug('ijsbrand')).toBe('IJsbrand');
    /*
     * `Æ` and `ø` have no NFD decomposition, so they fall through the
     * `[^a-z0-9]+` rule like a space does. Not pretty, and deliberately
     * asserted rather than glossed: the address is lossy, and the *list* is
     * what makes it unambiguous anyway.
     */
    expect(bySlug('aagje-r')).toBe('Aagje Ærø');
  });

  it('still opens a door for a name it cannot transliterate at all', () => {
    // `slugify`'s own fallback. Ugly, unique, and reachable — which is the bar.
    const kanji = spelers.spelerById('kanji');
    expect(kanji?.slug).toBe('entry');
    expect(spelers.spelerBySlug('entry')?.id).toBe('kanji');
    expect(gate.canWatch('page:/spelers/entry', AS)).toBe(true);
  });

  it('has no address for somebody the archive switched off, or for nobody at all', () => {
    expect(spelers.spelerById('weg')).toBeNull();
    expect(spelers.spelerHref('weg')).toBeNull();
    expect(spelers.spelerBySlug('weggestuurd')).toBeNull();
    expect(spelers.spelerHref('bestaat-niet')).toBeNull();
    expect(spelers.spelerHref(null)).toBeNull();
    expect(spelers.spelerHref(undefined)).toBeNull();
    expect(spelers.spelerBySlug('')).toBeNull();
  });

  it('follows a rename, because nothing is stored', () => {
    expect(spelers.spelerHref('bram')).toBe('/spelers/bram');
    sqlite.prepare(`UPDATE users SET username = ?, username_lower = ? WHERE id = 'bram'`).run('Bram de Vries', 'bram de vries');
    expect(spelers.spelerHref('bram')).toBe('/spelers/bram-de-vries');
    expect(spelers.spelerBySlug('bram')).toBeNull();
    sqlite.prepare(`UPDATE users SET username = ?, username_lower = ? WHERE id = 'bram'`).run('Bram', 'bram');
  });

  it('refuses an address the slugger could never have made', () => {
    // §21/§77: the gate's pattern is narrower than `ID` on purpose — a slug,
    // not an account name, and nothing that could climb out of the segment.
    expect(gate.canWatch('page:/spelers/Jan Willem', AS)).toBe(false);
    expect(gate.canWatch('page:/spelers/Jan_Willem', AS)).toBe(false);
    expect(gate.canWatch('page:/spelers/../admin', AS)).toBe(false);
    expect(gate.canWatch('page:/spelers/', AS)).toBe(false);
    expect(gate.canWatch('page:/spelers/jan/piet', AS)).toBe(false);
    // Signed out is nobody's business at all.
    expect(gate.canWatch('page:/spelers/bram', null)).toBe(false);
  });
});
