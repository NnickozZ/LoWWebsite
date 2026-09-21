import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §67 — de Achternaam gaat er weer af, en niemands tekst gaat mee.
 *
 * Round 31 gave Personen and Onderzoekers a plain `achternaam` Tekst beside the
 * three kinship fields. Round 33 takes it back: the Familie-veld already says
 * whose family somebody is and colours the card's frame with it, and a second
 * place holding the same name is a second place that can disagree.
 *
 * Taking a seeded field *away* is the direction the seed had never gone in, and
 * it has one rule the other markers do not need: **a box with something in it
 * stays.** So this file pins four things.
 *
 *  1. A fresh archive never has the field at all.
 *  2. An archive that has it, empty, loses it — both soorten.
 *  3. An archive where one artikel has an achternaam filled in **keeps the
 *     field on that soort**, silently, and loses it on the soort where nothing
 *     was filled in. Per soort, not per archive.
 *  4. It is a one-time sweep: the marker falls whatever happened, so a Keeper
 *     who puts the field back afterwards keeps it.
 *
 * Plus the narrowness of the match: key `achternaam` *and* kind `text`. A
 * Keeper who reused that key for something else owns it now (§11).
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-drop-achternaam-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
};
let deps: Deps;

const MARKER = 'seed:round-33-drop-achternaam';
const MENSEN = ['character', 'investigator'] as const;
const ACHTERNAAM: FieldDef = { key: 'achternaam', label: 'Achternaam', kind: 'text' };

const fieldsOf = (slug: string): FieldDef[] => {
  const row = deps.sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as FieldDef[]) : [];
};

const setFields = (slug: string, fields: FieldDef[]) =>
  deps.sqlite.prepare('UPDATE entry_types SET fields = ? WHERE slug = ?').run(JSON.stringify(fields), slug);

const has = (slug: string) => fieldsOf(slug).some((field) => field.key === 'achternaam');

/** An archive as round 31 left it: the field on both soorten, the marker not yet down. */
const asRound31 = () => {
  deps.sqlite.prepare('DELETE FROM schema_migrations WHERE name = ?').run(MARKER);
  for (const slug of MENSEN) {
    const fields = fieldsOf(slug).filter((field) => field.key !== 'achternaam');
    setFields(slug, [...fields, ACHTERNAAM]);
  }
};

let n = 0;
const person = (slug: string, fields: Record<string, unknown>, deleted = false) => {
  const id = `e-${(n += 1)}`;
  deps.sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, deleted_at)
       VALUES (?, ?, ?, ?, ?, '[]', 'all', 'keeper-1', 'all', ?)`,
    )
    .run(id, slug, `Iemand ${id}`, id, JSON.stringify(fields), deleted ? 1 : null);
  return id;
};

const wipeEntries = () => deps.sqlite.prepare('DELETE FROM entries').run();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  deps = { sqlite: dbModule.sqlite, seedBaseline: seed.seedBaseline };
  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper)
       VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 1)`,
    )
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  wipeEntries();
});

describe('§67 een vers archief', () => {
  it('has no Achternaam on Personen or Onderzoekers, and still has the three roles', () => {
    for (const slug of MENSEN) {
      expect(has(slug), slug).toBe(false);
      const keys = fieldsOf(slug).map((field) => field.key);
      expect(keys, slug).toContain('ouders');
      expect(keys, slug).toContain('kinderen');
      expect(keys, slug).toContain('partner');
    }
  });

  it('and the marker is down, so the sweep never runs on it', () => {
    const row = deps.sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(MARKER);
    expect(row).toBeTruthy();
  });
});

describe('§67 een bestaand archief', () => {
  it('loses the empty field on both soorten', () => {
    asRound31();
    // Somebody of each soort, with everything filled in but that one box.
    person('character', { ouders: [], aliases: 'Piet' });
    person('investigator', { achternaam: '' });
    // And one with only whitespace in it, which is not a name.
    person('character', { achternaam: '   ' });

    deps.seedBaseline(deps.sqlite);

    for (const slug of MENSEN) expect(has(slug), slug).toBe(false);
  });

  it('keeps it on the soort where somebody filled it in, and only there', () => {
    asRound31();
    person('character', { achternaam: 'Boone' });
    person('investigator', {});

    deps.seedBaseline(deps.sqlite);

    expect(has('character')).toBe(true);
    expect(fieldsOf('character').find((field) => field.key === 'achternaam')).toMatchObject({
      label: 'Achternaam',
      kind: 'text',
    });
    expect(has('investigator')).toBe(false);
  });

  it('does not count an artikel in the trash — it may still be restored, but it is not on the shelf', () => {
    asRound31();
    person('character', { achternaam: 'Boone' }, true);

    deps.seedBaseline(deps.sqlite);

    expect(has('character')).toBe(false);
  });

  it('leaves the key alone when the Keeper reused it for something else', () => {
    asRound31();
    setFields('character', [
      ...fieldsOf('character').filter((field) => field.key !== 'achternaam'),
      { key: 'achternaam', label: 'Achternaam', kind: 'entry_links', ofType: ['family'] },
    ]);

    deps.seedBaseline(deps.sqlite);

    expect(fieldsOf('character').find((field) => field.key === 'achternaam')).toMatchObject({
      kind: 'entry_links',
    });
    expect(has('investigator')).toBe(false);
  });
});

describe('§67 de marker', () => {
  it('runs exactly once — a field put back afterwards stays put', () => {
    asRound31();
    deps.seedBaseline(deps.sqlite);
    expect(has('character')).toBe(false);

    // The Keeper adds a box of their own under the old key, later.
    setFields('character', [...fieldsOf('character'), ACHTERNAAM]);
    deps.seedBaseline(deps.sqlite);
    expect(has('character')).toBe(true);
  });

  it('and falls even when both soorten kept their field', () => {
    asRound31();
    person('character', { achternaam: 'Boone' });
    person('investigator', { achternaam: 'de Rijke' });

    deps.seedBaseline(deps.sqlite);

    expect(has('character')).toBe(true);
    expect(has('investigator')).toBe(true);
    expect(deps.sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(MARKER)).toBeTruthy();

    // Empty them and run again: the marker is down, so nothing more happens.
    wipeEntries();
    deps.seedBaseline(deps.sqlite);
    expect(has('character')).toBe(true);
    expect(has('investigator')).toBe(true);
  });
});
