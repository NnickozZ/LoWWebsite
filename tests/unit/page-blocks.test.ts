import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_KINDS,
  cleanBlocks,
  cleanTypeText,
  defaultBlocks,
  isFieldKey,
  keyForTitle,
  resolveBlocks,
  type PageBlock,
} from '@/lib/pageBlocks';

const kinds = (blocks: PageBlock[]) => blocks.map((block) => block.kind);

describe('cleanBlocks', () => {
  it('gives an unconfigured type the standard page', () => {
    expect(kinds(cleanBlocks([]))).toEqual(BUILT_IN_KINDS);
    expect(kinds(cleanBlocks(null))).toEqual(BUILT_IN_KINDS);
    expect(kinds(cleanBlocks('nonsense'))).toEqual(BUILT_IN_KINDS);
  });

  it('puts back a built-in the Keeper managed to drop', () => {
    // The point of this rule: a page with no body is a page nobody can write on.
    const saved = [{ id: 'fields', kind: 'fields' }];
    const out = cleanBlocks(saved);
    expect(kinds(out)).toContain('body');
    expect(kinds(out)).toContain('history');
    expect(out.filter((block) => block.kind === 'fields')).toHaveLength(1);
  });

  it('keeps the Keeper’s order and only appends what is missing', () => {
    const saved = [
      { id: 'body', kind: 'body' },
      { id: 'fields', kind: 'fields' },
    ];
    expect(kinds(cleanBlocks(saved)).slice(0, 2)).toEqual(['body', 'fields']);
  });

  it('never lets a built-in appear twice', () => {
    const out = cleanBlocks([
      { id: 'a', kind: 'body' },
      { id: 'b', kind: 'body' },
    ]);
    expect(out.filter((block) => block.kind === 'body')).toHaveLength(1);
  });

  it('drops a self-filling list with nothing to follow', () => {
    const out = cleanBlocks([
      { id: 'x', kind: 'derived', title: 'Leden' },
      { id: 'y', kind: 'derived', title: 'Leden', viaField: 'faction' },
    ]);
    const derived = out.filter((block) => block.kind === 'derived');
    expect(derived).toHaveLength(1);
    expect(derived[0].viaField).toBe('faction');
  });

  it('refuses a field key that is not a field key', () => {
    // A JSON path built out of typing is exactly what must not reach SQLite.
    const out = cleanBlocks([
      { id: 'x', kind: 'derived', viaField: "faction'); DROP TABLE entries;--" },
      { id: 'y', kind: 'derived', viaField: '$.anything' },
      { id: 'z', kind: 'derived', viaField: 'FACTION' },
    ]);
    expect(out.filter((block) => block.kind === 'derived')).toHaveLength(0);
  });

  it('gives a hand-filled list a key and keeps it when the heading changes', () => {
    const first = cleanBlocks([{ id: 'x', kind: 'links', title: 'Bondgenoten' }]);
    const key = first.find((block) => block.kind === 'links')?.key;
    expect(key).toBe('lijst_bondgenoten');

    const renamed = cleanBlocks([{ id: 'x', kind: 'links', title: 'Vrienden', key }]);
    // Renaming a heading must not orphan what players already filed under it.
    expect(renamed.find((block) => block.kind === 'links')?.key).toBe(key);
  });

  it('separates two lists that claim one key rather than dropping one', () => {
    // Dropping a block would take its contents with it, so the second is given
    // a key of its own and both stay on the page.
    const out = cleanBlocks([
      { id: 'x', kind: 'links', title: 'Bondgenoten', key: 'lijst_bondgenoten' },
      { id: 'y', kind: 'links', title: 'Anders', key: 'lijst_bondgenoten' },
    ]);
    const links = out.filter((block) => block.kind === 'links');
    expect(links).toHaveLength(2);
    expect(links[0].key).toBe('lijst_bondgenoten');
    expect(new Set(links.map((block) => block.key)).size).toBe(2);
  });

  it('names a new list after its own heading, once', () => {
    // The editor adds a list with no key; this is where it gets one, so the key
    // matches the words the Keeper typed and not a placeholder.
    const fresh = cleanBlocks([{ id: 'x', kind: 'links', title: 'Rivalen' }]);
    expect(fresh.find((block) => block.kind === 'links')?.key).toBe('lijst_rivalen');
  });

  it('gives every block a distinct id', () => {
    const out = cleanBlocks([
      { id: 'same', kind: 'links', title: 'Een' },
      { id: 'same', kind: 'links', title: 'Twee' },
      { id: 'same', kind: 'derived', viaField: 'faction' },
    ]);
    expect(new Set(out.map((block) => block.id)).size).toBe(out.length);
  });

  it('keeps hidden and open flags, and trims the words', () => {
    const out = cleanBlocks([
      { id: 'body', kind: 'body', title: '  Het verhaal  ', hidden: true, open: true, note: ' zo ' },
    ]);
    const body = out.find((block) => block.kind === 'body')!;
    expect(body.title).toBe('Het verhaal');
    expect(body.note).toBe('zo');
    expect(body.hidden).toBe(true);
    expect(body.open).toBe(true);
  });

  it('caps how many blocks one page can have', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `d${i}`,
      kind: 'derived',
      viaField: 'faction',
    }));
    expect(cleanBlocks(many).length).toBeLessThanOrEqual(24 + BUILT_IN_KINDS.length);
  });
});

describe('resolveBlocks', () => {
  it('leaves a type that was never touched on the standard page', () => {
    expect(resolveBlocks([])).toEqual(defaultBlocks());
    expect(resolveBlocks(undefined)).toEqual(defaultBlocks());
  });

  it('honours a saved arrangement', () => {
    const saved = [
      { id: 'body', kind: 'body' },
      { id: 'leden', kind: 'derived', title: 'Leden', viaField: 'faction' },
    ];
    const out = resolveBlocks(saved);
    expect(kinds(out).slice(0, 2)).toEqual(['body', 'derived']);
  });
});

describe('keyForTitle', () => {
  it('makes a key a JSON path can hold', () => {
    expect(isFieldKey(keyForTitle('Bondgenoten & vrienden', new Set()))).toBe(true);
    expect(isFieldKey(keyForTitle('Ruïne — Café ’t Anker', new Set()))).toBe(true);
  });

  it('steps aside for a key already in use', () => {
    const taken = new Set(['lijst_leden']);
    expect(keyForTitle('Leden', taken)).toBe('lijst_leden_2');
  });
});

describe('cleanTypeText', () => {
  it('keeps only the four sentences, trimmed', () => {
    expect(cleanTypeText({ bodyPlaceholder: '  Wat weet je?  ', nonsense: 'x' })).toEqual({
      bodyPlaceholder: 'Wat weet je?',
    });
  });

  it('treats an empty box as nothing said', () => {
    expect(cleanTypeText({ newButton: '   ' })).toEqual({});
    expect(cleanTypeText(null)).toEqual({});
    expect(cleanTypeText(['a'])).toEqual({});
  });
});
