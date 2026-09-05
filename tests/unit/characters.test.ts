import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §18: characters, against a real SQLite file.
 *
 * The rules under test: the first fiche tied on is worn at once; a Keeper wears
 * nobody; taking off what you wear falls back to the next one; and every name
 * the archive prints comes from who is active *now*.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-characters-'));
process.env.DATA_DIR = dir;

type Deps = typeof import('@/lib/characters') & { sqlite: typeof import('@/lib/db').sqlite };
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

function user(sqlite: Deps['sqlite'], id: string, name: string, isKeeper = false) {
  sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
       VALUES (?, ?, ?, 'x', 'x', ?)`,
    )
    .run(id, name, name.toLowerCase(), isKeeper ? 1 : 0);
}

function entry(sqlite: Deps['sqlite'], id: string, name: string, extra: Record<string, unknown> = {}) {
  sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, visibility, created_by, view_mode, edit_mode)
       VALUES (?, 'character', ?, ?, '{}', ?, ?, ?, 'all')`,
    )
    .run(
      id,
      name,
      id,
      (extra.visibility as string) ?? 'all',
      (extra.createdBy as string) ?? 'bram',
      (extra.viewMode as string) ?? 'all',
    );
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const characters = await import('@/lib/characters');
  deps = { ...characters, sqlite: dbModule.sqlite } as Deps;
  const { sqlite } = deps;

  user(sqlite, 'keeper-1', 'Keeper', true);
  user(sqlite, 'bram', 'Bram');
  user(sqlite, 'aagje', 'Aagje');

  entry(sqlite, 'vandijk', 'Onderzoeker Van Dijk');
  entry(sqlite, 'nel', 'Nel de Visser');
  entry(sqlite, 'geheim', 'Geheime agent', { visibility: 'keeper', createdBy: 'keeper-1' });
  entry(sqlite, 'prive', 'Privé-dagboek', { createdBy: 'aagje', viewMode: 'private' });
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tying on and wearing', () => {
  it('the first character tied is worn at once; a second is not', () => {
    deps.addCharacter('bram', 'vandijk', BRAM);
    expect(deps.activeCharacter('bram')?.entryId).toBe('vandijk');
    deps.addCharacter('bram', 'nel', BRAM);
    expect(deps.activeCharacter('bram')?.entryId).toBe('vandijk');
    expect(deps.listCharacters('bram').map((c) => c.name)).toEqual([
      'Onderzoeker Van Dijk',
      'Nel de Visser',
    ]);
  });

  it('switching, and taking everything off', () => {
    deps.setActiveCharacter('bram', 'nel', BRAM);
    expect(deps.activeCharacter('bram')?.name).toBe('Nel de Visser');
    deps.setActiveCharacter('bram', null, BRAM);
    expect(deps.activeCharacter('bram')).toBeNull();
    deps.setActiveCharacter('bram', 'vandijk', BRAM);
  });

  it('only a tied fiche can be worn', () => {
    expect(() => deps.setActiveCharacter('bram', 'geheim', BRAM)).toThrow(/niet aan dit account/);
  });

  it('a fiche you cannot see cannot be tied on', () => {
    expect(() => deps.addCharacter('aagje', 'geheim', AAGJE)).toThrow(/niet gevonden/);
    expect(() => deps.addCharacter('bram', 'prive', BRAM)).toThrow(/niet gevonden/);
    // …but the Keeper may tie it on for them.
    deps.addCharacter('aagje', 'geheim', KEEPER);
    expect(deps.listCharacters('aagje').map((c) => c.entryId)).toEqual([]); // hidden from Aagje herself
    deps.removeCharacter('aagje', 'geheim', KEEPER);
  });

  it('a Keeper is always the Keeper', () => {
    expect(() => deps.addCharacter('keeper-1', 'vandijk', KEEPER)).toThrow(/altijd de Keeper/);
    expect(deps.activeCharacter('keeper-1')).toBeNull();
  });

  it('nobody dresses anybody else', () => {
    expect(() => deps.addCharacter('bram', 'nel', AAGJE)).toThrow(/Alleen voor jezelf/);
    expect(() => deps.setActiveCharacter('bram', 'nel', AAGJE)).toThrow(/Alleen voor jezelf/);
  });

  it('taking off what you wear falls back to the next one, then to nobody', () => {
    deps.addCharacter('aagje', 'prive', AAGJE);
    expect(deps.activeCharacter('aagje')?.entryId).toBe('prive');
    deps.addCharacter('aagje', 'nel', AAGJE);
    deps.removeCharacter('aagje', 'prive', AAGJE);
    expect(deps.activeCharacter('aagje')?.entryId).toBe('nel');
    deps.removeCharacter('aagje', 'nel', AAGJE);
    expect(deps.activeCharacter('aagje')).toBeNull();
    expect(deps.listCharacters('aagje')).toEqual([]);
  });
});

describe('what the archive prints', () => {
  it('names the character worn now, the account otherwise, and the Keeper as the Keeper', () => {
    const names = deps.displayNames(
      [
        { id: 'bram', username: 'Bram', isKeeper: false },
        { id: 'aagje', username: 'Aagje', isKeeper: false },
        { id: 'keeper-1', username: 'Keeper', isKeeper: true },
      ],
      'Spelleider',
    );
    expect(names.get('bram')).toEqual({ label: 'Onderzoeker Van Dijk', account: 'Bram' });
    expect(names.get('aagje')).toEqual({ label: 'Aagje', account: 'Aagje' });
    expect(names.get('keeper-1')).toEqual({ label: 'Spelleider', account: 'Keeper' });
  });

  it('re-labels a feed in one go, keeping the account for the tooltip', () => {
    const feed = deps.attributed([
      { id: 1, actorId: 'bram', actorName: 'Bram', actorIsKeeper: false },
      { id: 2, actorId: 'keeper-1', actorName: 'Keeper', actorIsKeeper: true },
      { id: 3, actorId: null, actorName: null, actorIsKeeper: false },
    ]);
    expect(feed.map((row) => row.actorLabel)).toEqual(['Onderzoeker Van Dijk', 'Keeper', null]);
    expect(feed[0].actorAccount).toBe('Bram');
  });

  it('switching re-labels the past too', () => {
    deps.setActiveCharacter('bram', 'nel', BRAM);
    expect(deps.displayNameOf('bram')?.label).toBe('Nel de Visser');
    deps.setActiveCharacter('bram', 'vandijk', BRAM);
  });

  it('knows who plays a fiche', () => {
    expect(deps.playersOf('vandijk')).toEqual([{ id: 'bram', username: 'Bram', active: true }]);
    expect(deps.playersOf('nel')).toEqual([{ id: 'bram', username: 'Bram', active: false }]);
    expect(deps.playersOf('prive')).toEqual([]);
  });
});
