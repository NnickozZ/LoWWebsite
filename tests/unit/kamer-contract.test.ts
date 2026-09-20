import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAIMED_ICONS, MEANING } from '@/components/kamer/plekWords';
import { PLEK_KINDS } from '@/lib/kamers/shape';
import { DEFAULT_SCHEMES, SCHEME_KEYS, type Palette } from '@/lib/theme/schemes';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §84: het contract van de kamer, de winkel en de schil — als test.
 *
 * Ronde 45 was een UX-ronde, en dat is precies het soort ronde waarvan de
 * regels een half jaar later stilletjes verdwijnen: een `44px` die terugkruipt,
 * een icoon dat een tweede betekenis krijgt, een Nederlandse zin die in een
 * component belandt in plaats van in `lib/words.ts`. Geen van die drie breekt
 * iets — ze slijten alleen. Dus staan ze hier, en niet in een document.
 *
 * Wat hier **niet** in staat is hoe iets eruitziet. Een test die een kleur of
 * een marge vastlegt maakt elke volgende ronde duurder zonder iets te bewaken;
 * wat bewaakt wordt zijn de afspraken waarvan het *breken* onzichtbaar is.
 */

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** De bestanden die samen de feature zijn. */
const SCOPE = [
  'components/kamer/Beurs.tsx',
  'components/kamer/ShellBeurs.tsx',
  'components/kamer/Plek.tsx',
  'components/kamer/PlaceButton.tsx',
  'components/kamer/UnlockButton.tsx',
  'components/kamer/ClearButton.tsx',
  'components/kamer/Grootboek.tsx',
  'components/kamer/GrantForm.tsx',
  'components/kamer/RoomEffects.tsx',
  'components/kamer/Uitdeler.tsx',
  'components/kamer/plekWords.ts',
  'components/winkel/WinkelRij.tsx',
  'components/winkel/WinkelFilter.tsx',
  'components/winkel/BuyButton.tsx',
  'components/winkel/KamerKiezer.tsx',
  'app/(app)/kamer/[slug]/page.tsx',
  'app/(app)/winkel/page.tsx',
  'app/(app)/uitdelen/page.tsx',
  /*
   * §85 bracht de hal en de spelerspagina in de feature: het kamerpaneel
   * draagt sinds deze ronde een beurs, de hal een woord en een merk, en de
   * deuren een werkwoord. Wat hier niet in staat wordt niet bewaakt — en een
   * regel die één scherm overslaat is precies hoe §84's slijtage begint.
   */
  'components/spelers/KamerPanel.tsx',
  'components/spelers/PanelDoor.tsx',
  'components/spelers/HalOnline.tsx',
  'app/(app)/spelers/page.tsx',
];

/* ======================================================= A. de iconen */

/**
 * §84's eerste belofte: één vorm, één betekenis.
 *
 * `box` was de kist, de winkel, het tabblad *wat je al hebt* én de lege cover
 * van elk stuk huisraad; `book` was de plank én de catalogus; `plus` was
 * neerzetten, geven, uitdelen en de uitdeelknop. Een icoon dat vier dingen
 * betekent betekent er geen, en niemand ziet dat gebeuren — het sluipt erin
 * doordat elke knop op zichzelf een redelijk icoon kiest.
 */
describe('§84: één icoon per betekenis', () => {
  it('claims a different shape for every meaning', () => {
    const seen = new Map<string, string>();
    for (const [meaning, icon] of Object.entries(MEANING)) {
      expect(seen.has(icon), `${icon} betekent al "${seen.get(icon)}" én "${meaning}"`).toBe(false);
      seen.set(icon, meaning);
    }
  });

  it('claims a different shape for every kind of plek, and none of them a meaning', () => {
    // `CLAIMED_ICONS` is de vier plekken plus elke betekenis, achter elkaar.
    expect(new Set(CLAIMED_ICONS).size).toBe(CLAIMED_ICONS.length);
    expect(CLAIMED_ICONS.length).toBe(PLEK_KINDS.length + Object.keys(MEANING).length);
  });

  /** En elke vorm die geclaimd wordt bestaat ook echt — een typo valt terug op `file`. */
  it('names only shapes the icon set actually draws', () => {
    const source = read('components/Icon.tsx');
    for (const icon of CLAIMED_ICONS) {
      expect(source, icon).toContain(`\n  ${icon}:`);
    }
  });

  /**
   * De omgekeerde vraag, en de enige die een *nieuwe* fout vangt: tekent iets in
   * deze feature een icoon dat niet in de tabel staat? Dan is er een betekenis
   * bij gekomen zonder dat iemand gekeken heeft of de vorm al bezet was.
   */
  it('draws no icon in this feature that the table does not name', () => {
    const allowed = new Set<string>(CLAIMED_ICONS);
    for (const path of SCOPE) {
      const source = read(path);
      for (const match of source.matchAll(/<Icon\s+name="([a-zA-Z]+)"/g)) {
        expect(allowed.has(match[1]), `${path} tekent "${match[1]}" buiten de tabel om`).toBe(true);
      }
    }
  });
});

/* ======================================================= B. de woorden */

/**
 * §11: elk zichtbaar woord is van de Keeper. Deze feature had er negen die dat
 * niet waren, en drie ervan waren dezelfde zin — `Je hebt nog n munten nodig.`
 * stond letterlijk in de tegel, in de plek-kiezer en in de winkelrij.
 */
describe('§84/§11: geen losse Nederlandse zinnen in de feature', () => {
  /**
   * Eén heuristiek, en ze is met opzet grof: een letterlijke string met een
   * spatie erin en een Nederlands woord dat in geen enkel woordenboek van dit
   * archief staat, is verdacht. Wat hier nog wél staat, staat in de lijst
   * eronder met een reden — dat is de hele functie van deze test: iets
   * toevoegen dwingt een zin over waarom.
   */
  const ALLOWED = [
    // Twee losse Nederlandse zinnen in de plek-kiezer die §80 bewust niet
    // hernoembaar maakte: "wat je al hebt" is geen zelfstandig naamwoord dat
    // een campagne anders noemt, het is de vraag die het tabblad stelt.
    'Wat je al hebt',
    'Niets dat hier past.',
    'Even kijken…',
    'Zoeken…',
    // §85: 'Nog geen regels.' stond hier tot ronde 46 en is nu `ledgerEmpty`.
    // 'Recente bijdragen' is de kop van een paneel en woont in de registry,
    // niet in een van deze bestanden.
  ];

  it('keeps every visible sentence in lib/words.ts', () => {
    const offenders: string[] = [];
    for (const path of SCOPE) {
      for (const line of read(path).split('\n')) {
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;
        for (const match of code.matchAll(/'([^']{8,})'|"([^"]{8,})"/g)) {
          const text = match[1] ?? match[2];
          if (!/\s/.test(text)) continue;
          if (!/^[A-Z]/.test(text)) continue;
          if (ALLOWED.includes(text)) continue;
          offenders.push(`${path}: ${text}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /** En de sjablonen houden hun gat, of het getal verdwijnt uit de zin. */
  it('keeps the placeholder in every word that has one', () => {
    expect(DEFAULT_WORDS.shortfall).toContain('{n}');
    expect(DEFAULT_WORDS.shopOwnedCount).toContain('{n}');
    expect(DEFAULT_WORDS.boughtHere).toContain('{ding}');
    expect(DEFAULT_WORDS.boughtHere).toContain('{plek}');
    expect(DEFAULT_WORDS.unlockedHere).toContain('{plek}');
    expect(DEFAULT_WORDS.clearedHere).toContain('{ding}');
    expect(DEFAULT_WORDS.keeperGuest).toContain('{naam}');
    expect(DEFAULT_WORDS.keeperGuestGift).toContain('{naam}');
    // §85: de zinnen van het grootboek, de deuren en de uitdeler.
    expect(DEFAULT_WORDS.ledgerSlotLine).toContain('{plek}');
    expect(DEFAULT_WORDS.ledgerItemLine).toContain('{ding}');
    expect(DEFAULT_WORDS.ledgerFrom).toContain('{keeper}');
    expect(DEFAULT_WORDS.ledgerFrom).toContain('{reden}');
    expect(DEFAULT_WORDS.ledgerFromPlain).toContain('{keeper}');
    expect(DEFAULT_WORDS.slotClearOne).toContain('{ding}');
    expect(DEFAULT_WORDS.toRoom).toContain('{kamer}');
    expect(DEFAULT_WORDS.toPlayers).toContain('{spelers}');
    expect(DEFAULT_WORDS.toCases).toContain('{dossiers}');
    expect(DEFAULT_WORDS.handoutRunning).toContain('{munten}');
    expect(DEFAULT_WORDS.handoutRunning).toContain('{kamers}');
    for (const gap of ['{open}', '{alle}', '{gevuld}']) {
      expect(DEFAULT_WORDS.roomPanelLine).toContain(gap);
    }
  });

  it('fills a gap, leaves an unknown one alone, and never throws', () => {
    expect(fill('Nog {n} nodig', { n: '3 munten' })).toBe('Nog 3 munten nodig');
    // Twee keer hetzelfde gat: allebei.
    expect(fill('{n} van {n}', { n: '2' })).toBe('2 van 2');
    // Een gat waar niets voor meegegeven is blijft staan — zichtbaar mis is
    // beter dan een gat in een zin.
    expect(fill('Je {plek} is open.', {})).toBe('Je {plek} is open.');
    // En een Keeper die het gat weghaalt krijgt zijn zin, zonder getal.
    expect(fill('De plek is open.', { plek: 'plank' })).toBe('De plek is open.');
  });
});

/* ======================================================= C. de stylesheets */

describe('§84: de stylesheets van de feature', () => {
  const sheets = ['app/kamer.css', 'app/spelers.css'];

  /**
   * §69 6.1 meet een vinger in `--tap`, en dat is 44 px op één plek. Twee
   * letterlijke `44px` stonden in `kamer.css` — een getal dat niet meer mee
   * verandert als de rest dat wel doet.
   */
  it('measures a finger with the token and never with a number', () => {
    for (const path of sheets) expect(read(path), path).not.toContain('44px');
  });

  /**
   * En het breekpunt. `useIsPhone` zegt 767 en de rest van de app ook; deze twee
   * bestanden zeiden 560, dus tussen 561 en 767 px stond de kamer in
   * bureaublad-opmaak terwijl de app zichzelf een telefoon noemde.
   */
  it('breaks where the rest of the app breaks', () => {
    for (const path of sheets) {
      const source = read(path);
      expect(source, path).not.toContain('560px');
      if (source.includes('max-width:')) expect(source, path).toContain('max-width: 767px');
    }
    expect(read('components/useIsPhone.ts')).toContain('767px');
  });

  /** §45: geen letterlijke kleur in deze twee bestanden. Dat was zo; houd het zo. */
  it('names no colour of its own', () => {
    for (const path of sheets) {
      const source = read(path);
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], path).toEqual([]);
      expect(source.match(/\brgba?\(/g) ?? [], path).toEqual([]);
    }
  });

  /**
   * Een klasse die niets tekent is een klasse die iemand gaat vertrouwen.
   * `winkel-lijst`, `winkel-buy`, `spelers-index`, `spelers-rij` en `speler-nu`
   * stonden alle vijf in de opmaak en in geen enkel stylesheet.
   */
  it('draws every class name the feature writes', () => {
    const styles = [
      read('app/globals.css'),
      read('app/kamer.css'),
      read('app/spelers.css'),
      read('app/aanwezig.css'),
    ].join('\n');
    const missing: string[] = [];
    for (const path of [...SCOPE, 'app/(app)/spelers/page.tsx', 'app/(app)/spelers/[naam]/page.tsx']) {
      for (const match of read(path).matchAll(/className=["`]([^"`{}]+)["`]/g)) {
        for (const name of match[1].split(/\s+/).filter(Boolean)) {
          if (!styles.includes(`.${name}`)) missing.push(`${path}: .${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

/* ======================================================= D. licht en donker */

/** WCAG relative luminance of a `#rrggbb`. Written out, as `tree-contrast` does. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/**
 * §84's donker-fix, van de kant die faalde.
 *
 * Een uitgeschakelde `btn-primary` was een rode vulling op 50% dekking. In een
 * licht palet was dat nog net een verschil; in een donker palet was een
 * uitgeschakelde "Kopen" bijna dezelfde kleur als een ingeschakelde, en dat is
 * de ergste van de fouten die alleen 's avonds bestaan — je ziet niet meer wat
 * je kunt betalen.
 *
 * De reparatie is een *vorm* in plaats van een tint (gestreept, doorzichtig,
 * `--ink-muted`), en dat is niet met een contrastgetal te bewijzen. Wat hier
 * gemeten wordt is de helft die er wél mee te bewijzen is: de tekst op zo'n
 * uitgeschakelde knop blijft leesbaar op het papier eronder, in alle vier.
 */
describe.each(SCHEME_KEYS)('§84 in %s', (key) => {
  const palette: Palette = DEFAULT_SCHEMES[key];

  it('keeps a held-back button legible on the paper it stands on', () => {
    expect(ratio(palette.inkMuted, palette.paperRaised)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(palette.inkMuted, palette.paper)).toBeGreaterThanOrEqual(4.5);
  });

  /** De prijs-stempel staat op een tegel (`--paper-raised`) en op een gesloten tegel
      (`--paper-dark`); in beide moet hij te lezen zijn, want hij ís de prijs. */
  it('keeps a price stamp legible on both kinds of tile', () => {
    expect(ratio(palette.stampRed, palette.paperRaised)).toBeGreaterThanOrEqual(3);
    expect(ratio(palette.stampRed, palette.paperDark)).toBeGreaterThanOrEqual(3);
  });

  /** En de beurs staat in gewone inkt, want een saldo is geen stempel. */
  it('keeps the purse in ordinary ink, well clear of the paper', () => {
    expect(ratio(palette.ink, palette.paperRaised)).toBeGreaterThanOrEqual(7);
  });
});

/* ======================================================= E. §85's eigen beloftes */

/**
 * §85 ging over vorm: één rijhoogte, één betekenis per vorm, en een zin waar
 * een veldnaam stond. Wat daarvan te *meten* is staat hieronder; hoe het eruit
 * ziet staat in `claude/shots-round-46/`, want daar hoort het.
 */
describe('§85: het raster heeft één hoogte, en die staat op één plek', () => {
  const sheet = read('app/kamer.css');

  /**
   * De reparatie van het raster is één `grid-auto-rows`, en de val is dat
   * iemand hem later "even" weghaalt omdat een tegel toch wel uitgroeit. Dan
   * breekt het raster weer bij de eerste koop — precies zoals het vier rondes
   * deed — en niets zegt er iets van. Twee regels: hij bestaat, en de tegel
   * neemt die hoogte in plaats van er een eigen minimum naast te zetten.
   */
  it('gives every tile the row height and no minimum of its own', () => {
    expect(sheet).toContain('grid-auto-rows:');
    expect(sheet.match(/\.plek \{[^}]*min-height:/s) ?? [], 'een tegel heeft geen eigen minimum meer').toEqual([]);
  });

  /**
   * En de vierkante uitsnede hoort bij de *tegel*. `.plek-cover` wordt ook
   * door een winkelrij gedragen, waar hij 3rem breed is — een hoogte van
   * 6,4rem maakte daar een staande streep van elk omslagje, en in de kamer
   * klopte diezelfde regel. Dat is §83's les nog een keer: een tweede lezer
   * van dezelfde klasse beweegt niet mee.
   */
  it('sizes the square cover inside a tile only', () => {
    expect(sheet).toContain('.plek .plek-cover');
    expect(sheet.match(/(^|\n)\.plek-cover \{[^}]*aspect-ratio/s) ?? []).toEqual([]);
  });
});

describe('§85: een bedrag in het grootboek is geen prijskaartje', () => {
  /**
   * §84 gaf het saldo een eigen vorm omdat een `.stamp` een *prijs* betekent.
   * Het grootboek bleef er drie onder elkaar tekenen, waarvan één met een `+`
   * ervoor — drie rode kaartjes die alle drie als waarschuwing lezen. De
   * stempel is eraf; deze test is er zodat hij er niet stilletjes terugkruipt.
   */
  it('draws a ledger amount without the stamp', () => {
    const source = read('components/kamer/Grootboek.tsx');
    expect(source).not.toContain('stamp kamer-delta');
    expect(source).toContain('kamer-delta');
  });
});

describe('§85: de deuren dragen een werkwoord', () => {
  /**
   * Een deur die naar zijn bestemming genoemd is (*Kamer*, *Dossiers*) leest
   * als een kop; een deur met een werkwoord (*Naar de kamer*) leest als een
   * deur. Alle vier de sleutels beginnen dus met hetzelfde woord, en wie er
   * een vijfde bij zet komt hier langs.
   */
  it('names every door as a way out and not as a place', () => {
    for (const key of ['toRoom', 'toPlayers', 'toCharacters', 'toCases']) {
      expect(DEFAULT_WORDS[key], key).toMatch(/^Naar /);
    }
  });
});
