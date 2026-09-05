import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keysOfStatement } from '@/lib/live/changes';
import { isRoomKey, isWellFormedKey, keysOfRoom, parseRecordKey } from '@/lib/live/keys';
import { textDelta } from '@/lib/live/textDelta';

/**
 * §21: live is not a feature of some pages; it is how every page works.
 *
 * The first block is the rule that keeps it that way: every page under
 * `app/(app)` renders `<LivePage>`, so a page added next month is live from
 * its first render or fails this test. The rest pins the parser that turns a
 * database statement into change keys — the one piece of the layer that has
 * to be right for *every* write, including the ones nobody wrote a `touch()`
 * for.
 */

const ROOT = join(import.meta.dirname, '..', '..');

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pagesUnder(path));
    else if (name === 'page.tsx') out.push(path);
  }
  return out;
}

describe('every page inside the shell is live', () => {
  const pages = pagesUnder(join(ROOT, 'app', '(app)'));

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(13);
  });

  for (const page of pages) {
    it(`${relative(ROOT, page)} renders <LivePage>`, () => {
      const source = readFileSync(page, 'utf8');
      expect(source).toMatch(/<LivePage\b/);
      expect(source).toMatch(/from '@\/components\/live\/LivePage'/);
    });
  }

  it('the shell mounts the provider and the strip once', () => {
    const shell = readFileSync(join(ROOT, 'components', 'AppShell.tsx'), 'utf8');
    expect(shell).toMatch(/<LiveProvider>/);
    expect(shell).toMatch(/<LiveStrip \/>/);
  });

  it('the database layer runs every statement through the change logger', () => {
    const db = readFileSync(join(ROOT, 'lib', 'db', 'index.ts'), 'utf8');
    expect(db).toMatch(/logger: changeLogger/);
  });
});

describe('keys', () => {
  it('parses record keys and nothing else', () => {
    expect(parseRecordKey('entry:abc_1')).toEqual({ kind: 'entry', id: 'abc_1' });
    expect(parseRecordKey('pin:p-9')).toEqual({ kind: 'pin', id: 'p-9' });
    expect(parseRecordKey('entries')).toBeNull();
    expect(parseRecordKey('entry:abc:body')).toBeNull();
    expect(parseRecordKey('user:abc')).toBeNull();
  });

  it('knows the room shapes', () => {
    for (const key of ['entry:a:body', 'entry:a:fields', 'section:s1', 'case:c:notes', 'case:c:fields', 'map:m:fields', 'pin:p:fields']) {
      expect(isRoomKey(key), key).toBe(true);
    }
    expect(isRoomKey('entry:a')).toBe(false);
    expect(isRoomKey('board:b:fields')).toBe(false);
    expect(keysOfRoom('entry:a:fields')).toEqual(['entry:a']);
    expect(keysOfRoom('section:s1')).toEqual([]);
  });

  it('refuses keys that could not be a key', () => {
    expect(isWellFormedKey('page:/wiki/soort')).toBe(true);
    expect(isWellFormedKey('x'.repeat(141))).toBe(false);
    expect(isWellFormedKey('entry:<script>')).toBe(false);
    expect(isWellFormedKey(42)).toBe(false);
  });
});

describe('keysOfStatement: what a write means', () => {
  it('reads are nothing', () => {
    expect(keysOfStatement('select "id" from "entries" where "entries"."id" = ?', ['a'])).toEqual([]);
  });

  it('an update by id names the row and its collections', () => {
    const keys = keysOfStatement(
      'update "entries" set "name" = ?, "updated_at" = ? where "entries"."id" = ?',
      ['Nieuwe naam', 1700000000, 'entry-1'],
    );
    expect(keys).toEqual(expect.arrayContaining(['entries', 'feed', 'entry:entry-1']));
    expect(keys).toHaveLength(3);
  });

  it('a delete by id, with a compound where', () => {
    const keys = keysOfStatement(
      'delete from "map_pins" where ("map_pins"."id" = ? and "map_pins"."map_id" = ?)',
      ['pin-1', 'map-1'],
    );
    expect(keys).toEqual(expect.arrayContaining(['maps', 'pin:pin-1', 'map:map-1']));
  });

  it('an insert takes ids from the column list, skipping defaults', () => {
    const keys = keysOfStatement(
      'insert into "case_entries" ("case_id", "entry_id", "added_by", "note", "crop", "added_at") values (?, ?, ?, ?, null, default)',
      ['case-1', 'entry-2', 'user-1', ''],
    );
    expect(keys).toEqual(expect.arrayContaining(['cases', 'case:case-1', 'entry:entry-2']));
    expect(keys).not.toContain('entry:user-1');
  });

  it('a multi-row insert', () => {
    const keys = keysOfStatement(
      'insert into "entry_links" ("from_entry_id", "to_entry_id", "kind") values (?, ?, ?), (?, ?, ?)',
      ['a', 'b', 'mention', 'a', 'c', 'mention'],
    );
    expect(keys.sort()).toEqual(['entry:a', 'entry:b', 'entry:c']);
  });

  it('an `in (…)` list', () => {
    const keys = keysOfStatement('delete from "entry_reveals" where "entry_reveals"."entry_id" in (?, ?)', ['x', 'y']);
    expect(keys).toEqual(expect.arrayContaining(['entries', 'entry:x', 'entry:y']));
  });

  it('a grant names its target by kind', () => {
    const keys = keysOfStatement(
      'insert into "access_grants" ("id", "target_type", "target_id", "user_id", "role") values (?, ?, ?, ?, ?)',
      ['g1', 'case', 'case-9', 'u', 'edit'],
    );
    expect(keys).toEqual(expect.arrayContaining(['cases', 'case:case-9']));
    expect(keys).not.toContain('user:u');
  });

  it('an unknown table is nothing; a non-id value is not a key', () => {
    expect(keysOfStatement('update "schema_migrations" set "x" = ? where "id" = ?', [1, 'a'])).toEqual([]);
    const keys = keysOfStatement('update "entries" set "name" = ? where "entries"."id" = ?', ['n', 'has spaces']);
    expect(keys).toEqual(expect.arrayContaining(['entries', 'feed']));
    expect(keys.some((k) => k.startsWith('entry:'))).toBe(false);
  });

  it('a pin update also moves its map (the service touches maps.updated_at)', () => {
    // Two statements, as `updatePin` runs them; each carries its own keys.
    const a = keysOfStatement('update "map_pins" set "x" = ? where "map_pins"."id" = ?', [0.5, 'pin-1']);
    const b = keysOfStatement('update "maps" set "updated_at" = ? where "maps"."id" = ?', [1, 'map-1']);
    expect(a).toContain('pin:pin-1');
    expect(b).toContain('map:map-1');
  });
});

describe('textDelta: the smallest edit between two strings', () => {
  it('typing at the end', () => {
    expect(textDelta('Kaas', 'Kaasm')).toEqual({ at: 4, remove: 0, insert: 'm' });
  });
  it('typing in the middle', () => {
    expect(textDelta('Kas', 'Kaas')).toEqual({ at: 2, remove: 0, insert: 'a' });
  });
  it('deleting a run', () => {
    expect(textDelta('Kaasmarkt', 'Kaas')).toEqual({ at: 4, remove: 5, insert: '' });
  });
  it('replacing a selection', () => {
    expect(textDelta('de rode deur', 'de groene deur')).toEqual({ at: 3, remove: 3, insert: 'groen' });
  });
  it('nothing', () => {
    expect(textDelta('x', 'x')).toBeNull();
  });
  it('a repeated character does not confuse the suffix', () => {
    // "aa" → "aaa": one insert, not a delete and a longer insert.
    expect(textDelta('aa', 'aaa')).toEqual({ at: 2, remove: 0, insert: 'a' });
  });
});
