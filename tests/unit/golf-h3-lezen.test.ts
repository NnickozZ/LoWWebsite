import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { naadHoofd, naadSneden, naadTekst, type NaadStuk } from '@/lib/wiki/naad';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §104, golf H (h3 — lezen en de wiki). The pure halves of D6 (which soorten
 * stand in the one row of tabs), D28 (the capital after a hidden name) and D1
 * (the outline column from 1500 px, one number in two files).
 */

const APP = join(import.meta.dirname, '..', '..', 'app');
const css = (name: string) => readFileSync(join(APP, name), 'utf8');

describe('D6, sinds golf N: elke soort is een tab, de rij breekt', () => {
  it('er is geen menu met soorten meer, en de tabrij mag breken', () => {
    const tabs = readFileSync(join(APP, '..', 'components', 'TypeTabs.tsx'), 'utf8');
    expect(tabs).not.toContain('MeerSoorten');
    expect(tabs).not.toContain('data-rang');
    expect(tabs).toContain('types.map(');
    expect(css('leeskamer.css')).not.toContain('meer-soorten');
    expect(css('ruimte.css')).toMatch(/\.type-tabs-alle\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});

describe('D28: naadHoofd — een hoofdletter na een weggevallen naam', () => {
  const zin = (...stukken: NaadStuk[]) => stukken;

  it('een alinea die met een verborgen naam begint, begint met een hoofdletter', () => {
    const stukken = zin({ verborgen: true }, { tekst: ' heeft er tweemaal gestaan.' });
    const hoofd = naadHoofd(stukken);
    expect(hoofd).toEqual({ stuk: 1, van: 1, tot: 2 });
    expect(naadTekst(stukken)).toBe('heeft er tweemaal gestaan.');
  });

  it('ook na een komma die met het gat meegaat', () => {
    const stukken = zin({ verborgen: true }, { tekst: ', en toen niemand meer.' });
    const hoofd = naadHoofd(stukken)!;
    const tekst = (stukken[1] as { tekst: string }).tekst;
    expect(tekst.slice(hoofd.van, hoofd.tot)).toBe('e');
  });

  it('"ij" is één letter', () => {
    const hoofd = naadHoofd(zin({ verborgen: true }, { tekst: ' ijsland lag verder.' }))!;
    expect(hoofd.tot - hoofd.van).toBe(2);
  });

  it('niets als er vóór het gat al iets staat, of als de letter al groot is', () => {
    expect(naadHoofd(zin({ tekst: 'Toen kwam ' }, { verborgen: true }, { tekst: ' binnen.' }))).toBeNull();
    expect(naadHoofd(zin({ verborgen: true }, { tekst: ' Lang bleef.' }))).toBeNull();
    expect(naadHoofd(zin({ verborgen: true }, { tekst: ' 1931 was koud.' }))).toBeNull();
    expect(naadHoofd(zin({ vast: true }, { tekst: ' en de rest.' }))).toBeNull();
    expect(naadHoofd(zin({ tekst: 'gewoon een zin.' }))).toBeNull();
  });

  it('rekent met dezelfde sneden als de naad', () => {
    const stukken = zin({ tekst: '  ' }, { verborgen: true }, { tekst: ' , wie weet.' });
    const sneden = naadSneden(stukken);
    const hoofd = naadHoofd(stukken, sneden)!;
    expect(hoofd.stuk).toBe(2);
    expect((stukken[2] as { tekst: string }).tekst[hoofd.van]).toBe('w');
  });

  it('alleen de weergave: de klasse verandert de letter in Lezen, niet in Bewerken', () => {
    expect(css('leeskamer.css')).toMatch(/\.ProseMirror\[contenteditable='false'\] \.naad-hoofd\s*\{\s*text-transform: uppercase;/);
  });
});

describe('D1: de wegwijzer als kolom pas vanaf 1500 px', () => {
  it('useIsPhone en leeskamer.css noemen hetzelfde getal', () => {
    const hook = readFileSync(join(import.meta.dirname, '..', '..', 'components', 'useIsPhone.ts'), 'utf8');
    expect(hook).toContain("const RAIL = '(min-width: 1500px)'");
    expect(css('leeskamer.css')).toMatch(/@media \(min-width: 1500px\) \{\s*\.entry-layout-wide\.entry-layout-rail \{\s*grid-template-columns: 12rem minmax\(0, 1fr\) 320px;/);
  });

  it('tussen 1280 en 1499 px zijn het twee kolommen: tekst en feiten', () => {
    expect(css('globals.css')).toMatch(/\.entry-layout-wide \{[^}]*grid-template-columns: minmax\(0, 1fr\) 300px;/);
  });
});

describe('de woorden van golf h3', () => {
  it('staan onder de eigen markering en vullen in', () => {
    const source = readFileSync(join(import.meta.dirname, '..', '..', 'lib', 'words.ts'), 'utf8');
    const at = source.indexOf('// ── golf h3');
    expect(at).toBeGreaterThan(0);
    expect(source.indexOf("key: 'navNewInCase'")).toBeGreaterThan(at);
    // Golf N: *Meer soorten* is weg, en zijn woord ook.
    expect(source).not.toContain("key: 'wikiMoreKinds'");
    expect(fill(DEFAULT_WORDS.navNewInCase, { dossier: DEFAULT_WORDS.case })).toBe('Nieuw in dit dossier');
    expect(DEFAULT_WORDS.caseNotesNone).not.toMatch(/!/);
  });
});
