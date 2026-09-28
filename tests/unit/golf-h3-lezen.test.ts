import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IN_RIJ, rangSoorten } from '@/lib/wiki/tabrij';
import { naadHoofd, naadSneden, naadTekst, type NaadStuk } from '@/lib/wiki/naad';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §104, golf H (h3 — lezen en de wiki). The pure halves of D6 (which soorten
 * stand in the one row of tabs), D28 (the capital after a hidden name) and D1
 * (the outline column from 1500 px, one number in two files).
 */

const APP = join(import.meta.dirname, '..', '..', 'app');
const css = (name: string) => readFileSync(join(APP, name), 'utf8');

describe('D6: rangSoorten — één rij soorttabs', () => {
  const soorten = [
    { slug: 'personen', count: 14 },
    { slug: 'onderzoekers', count: 12 },
    { slug: 'locaties', count: 14 },
    { slug: 'relieken', count: 13 },
    { slug: 'leeg', count: 0 },
    { slug: 'clues', count: 14 },
    { slug: 'huisraad', count: 6 },
    { slug: 'abnormaliteiten', count: 15 },
    { slug: 'goden', count: 7 },
    { slug: 'talen', count: 9 },
    { slug: 'facties', count: 14 },
  ];

  it('zet de grootste soorten in de rij, gelijke tellingen in de volgorde van de Keeper', () => {
    const { rang } = rangSoorten(soorten, 'alles');
    const opRang = [...rang].sort((a, b) => a[1] - b[1]).map(([slug]) => slug);
    expect(opRang).toEqual(['abnormaliteiten', 'personen', 'locaties', 'clues', 'facties', 'relieken', 'onderzoekers']);
    expect(rang.size).toBe(IN_RIJ);
  });

  it('de soort waar je op staat heeft rang 0 en staat er altijd, ook als hij klein is', () => {
    const { rang } = rangSoorten(soorten, 'huisraad');
    expect(rang.get('huisraad')).toBe(0);
    // En hij neemt geen plek van de zeven grootste in.
    expect([...rang.values()].filter((r) => r > 0)).toHaveLength(IN_RIJ);
  });

  it('een lege soort staat nooit in de rij, behalve als je erop staat', () => {
    expect(rangSoorten(soorten, 'alles').rang.has('leeg')).toBe(false);
    expect(rangSoorten(soorten, 'leeg').rang.get('leeg')).toBe(0);
  });

  it('zegt wanneer het menu leeg is: alleen als elke soort een rang heeft', () => {
    expect(rangSoorten(soorten, 'alles').nodigTot).toBeNull();
    const weinig = [
      { slug: 'a', count: 3 },
      { slug: 'b', count: 2 },
      { slug: 'c', count: 1 },
    ];
    expect(rangSoorten(weinig, null).nodigTot).toBe(3);
    expect(rangSoorten(weinig, 'b').nodigTot).toBe(2);
  });

  it('de stylesheet kent elke rang van 1 tot IN_RIJ, en verbergt in het menu wat in de rij staat', () => {
    const source = css('leeskamer.css');
    for (let r = 1; r <= IN_RIJ; r++) expect(source).toContain(`[data-rang='${r}']`);
    expect(source).toMatch(/\.meer-soorten-lijst > li:is\(\[data-rang='1'\]/);
    // Geen drie rijen meer: de tabrij breekt nergens.
    expect(css('globals.css')).not.toMatch(/\.type-tabs\s*\{[^}]*flex-wrap:\s*wrap/);
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
    expect(source.indexOf("key: 'wikiMoreKinds'")).toBeGreaterThan(at);
    expect(fill(DEFAULT_WORDS.navNewInCase, { dossier: DEFAULT_WORDS.case })).toBe('Nieuw in dit dossier');
    expect(DEFAULT_WORDS.caseNotesNone).not.toMatch(/!/);
  });
});
