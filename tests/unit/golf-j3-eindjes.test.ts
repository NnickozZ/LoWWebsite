import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountedPanes, openPanes } from '@/lib/beheer';
import { defaultIntro } from '@/lib/intro';
import { takeEarlyPress, VROEGE_KLIK_SCRIPT } from '@/lib/vroegeKlik';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX } from '@/lib/words';

/**
 * Golf J, j3: de Keeper, de eerste keer en de losse eindjes van golf I.
 * De e2e-helft staat in `tests/e2e/golf-j3-eindjes.spec.ts`.
 */

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', '..', path), 'utf8');

describe('Beheer: een wissel van onderdeel gooit niets weg (§107, golf J)', () => {
  const keys = ['users', 'review', 'trash', 'types', 'words', 'site'];

  it('houdt het gekozen paneel gemount, en elk paneel met iets niet-bewaards', () => {
    expect(mountedPanes(keys, 'users', new Set())).toEqual(['users']);
    expect(mountedPanes(keys, 'users', new Set(['types']))).toEqual(['users', 'types']);
    // In de volgorde van de index, zodat React niets opnieuw mount bij een wissel.
    expect(mountedPanes(keys, 'words', new Set(['types', 'words']))).toEqual(['types', 'words']);
    expect(mountedPanes(keys, undefined, new Set())).toEqual([]);
  });

  it('een paneel is open zolang één van zijn formulieren iets meldt', () => {
    const reports = new Map([
      ['types', new Map([['a', 0], ['b', 2]])],
      ['words', new Map([['c', 0]])],
      ['site', new Map<string, number>()],
    ]);
    expect([...openPanes(reports)]).toEqual(['types']);
    reports.get('types')!.set('b', 0);
    expect(openPanes(reports).size).toBe(0);
  });

  it('AdminTabs rendert niet meer alleen het actieve paneel', () => {
    const src = read('components/admin/AdminTabs.tsx');
    expect(src).not.toContain('{current?.content}');
    expect(src).toContain('mountedPanes(');
    expect(src).toContain('hidden={!here || undefined}');
    // De docblock zegt niet meer dat een telefoon na een keuze de strook toont.
    expect(src).toMatch(/alleen\s+\*‹ Beheer\*/);
    // De soort-editor en Woorden melden zich.
    expect(read('components/admin/TypeEditor.tsx')).toContain('useNietBewaard(dirty)');
    expect(read('components/admin/WordsForm.tsx')).toContain('useNietBewaard(dirty)');
  });
});

describe('de soort-editor: één kiezer, en geen letterlijke woorden (§107, golf J)', () => {
  it('PageBlocksEditor gebruikt SoortKiezer, niet de rij van negentien chips', () => {
    const src = read('components/admin/PageBlocksEditor.tsx');
    expect(src).toContain('<SoortKiezer');
    expect(src).not.toContain('Kijk in deze soorten (leeg = alle)');
    expect(src).not.toContain('Alleen deze soorten mogen erin (leeg = alles)');
    expect(src).not.toMatch(/types\.map\(\(type\) => \{\s*const on =/);
  });

  it('TypeEditor zegt Koppelingen en Nog geen keuzes uit lib/words.ts', () => {
    const src = read('components/admin/TypeEditor.tsx');
    expect(src).not.toContain("'Koppelingen'");
    expect(src).not.toContain("'Nog geen keuzes'");
    expect(src).not.toContain('function TargetsPicker');
    expect(DEFAULT_WORDS.soortSnelKoppelingen).toBe('Koppelingen');
    expect(DEFAULT_WORDS.soortNogGeenKeuzes).toBe('Nog geen keuzes');
  });

  it('de nieuwe woorden staan in één groep, onder de markering van j3, en passen', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'Beheer, tweede pas (golf j3)');
    expect(group).toBeTruthy();
    for (const word of group!.words) {
      expect(word.fallback.length).toBeLessThanOrEqual(WORD_MAX);
      expect(word.fallback).not.toMatch(/!/);
    }
    const src = read('lib/words.ts');
    expect(src.indexOf('golf j3 — de Keeper')).toBeLessThan(src.indexOf("title: 'Beheer, tweede pas (golf j3)'"));
  });
});

describe('de welkomsttekst klopt op een telefoon en op een computer (golf J)', () => {
  it('zegt met de +, en die + staat op beide: de ronde knop en + Nieuw artikel in de zijbalk', () => {
    const intro = defaultIntro(DEFAULT_WORDS);
    // Nagekeken, niet veranderd: op een computer draagt *Nieuw artikel* in de
    // zijbalk het teken + (Icon plus), op een telefoon is het de ronde +. Ronde 51
    // (S10) koos voor de +; die zin klopt dus op beide maten.
    expect(intro).toContain('met de + een nieuw artikel');
    const shell = read('components/AppShell.tsx');
    const knop = shell.slice(shell.indexOf('nav-new'), shell.indexOf('nav-new') + 600);
    expect(knop).toMatch(/<Icon name="plus"/);
  });
});

describe('stuk 12: een druk vóór de hydratatie telt alsnog (golf J)', () => {
  type Listener = (event: { target: unknown }) => void;
  function fakePage() {
    const listeners: Listener[] = [];
    const win: Record<string, unknown> = {};
    const doc = { addEventListener: (_: string, fn: Listener) => listeners.push(fn) };
    new Function('window', 'document', VROEGE_KLIK_SCRIPT)(win, doc);
    const button = { getAttribute: (name: string) => (name === 'data-vroeg' ? 'bewerken' : null) };
    const inside = { closest: (selector: string) => (selector === '[data-vroeg]' ? button : null) };
    const elsewhere = { closest: () => null };
    const click = (target: unknown) => listeners.forEach((fn) => fn({ target }));
    return { win, listeners, click, inside, elsewhere };
  }

  it('onthoudt een druk op een knop met data-vroeg, en alleen die', () => {
    const page = fakePage();
    expect(page.listeners).toHaveLength(1);
    page.click(page.elsewhere);
    expect(page.win.__lwVroeg).toBeNull();
    page.click(page.inside);
    expect(page.win.__lwVroeg).toBe('bewerken');
    expect(takeEarlyPress('bewerken', page.win as never)).toBe(true);
    // Eén keer: daarna is hij weg, en luistert het script niet meer.
    expect(takeEarlyPress('bewerken', page.win as never)).toBe(false);
    page.click(page.inside);
    expect(page.win.__lwVroeg).toBeNull();
  });

  it('zonder vroege druk gebeurt er niets, en het script hangt maar één luisteraar op', () => {
    const page = fakePage();
    new Function('window', 'document', VROEGE_KLIK_SCRIPT)(page.win, {
      addEventListener: () => page.listeners.push(() => undefined),
    });
    expect(page.listeners).toHaveLength(1);
    expect(takeEarlyPress('bewerken', page.win as never)).toBe(false);
    expect(takeEarlyPress('bewerken', undefined)).toBe(false);
  });

  it('de knop Bewerken draagt data-vroeg, en het artikel leest de druk na de hydratatie', () => {
    const src = read('components/entry/EntryView.tsx');
    expect(src).toContain("data-vroeg={reading ? 'bewerken' : undefined}");
    expect(src).toContain("takeEarlyPress('bewerken')");
    expect(src).toContain('VROEGE_KLIK_SCRIPT');
  });
});

describe('Wie ben jij aan tafel?: de caret staat in het vak (§106, golf J)', () => {
  it('geeft de focus alleen als niets anders hem al heeft', () => {
    const src = read('components/eerste-keer/WieBenJij.tsx');
    expect(src).toContain('ref={nameRef}');
    expect(src).toMatch(/active !== document\.body/);
    expect(src).toContain('preventScroll: true');
  });
});
