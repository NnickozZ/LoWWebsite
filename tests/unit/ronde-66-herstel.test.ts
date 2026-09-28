import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plekIcon } from '@/components/kamer/plekWords';
import { holdBeforeRefresh } from '@/components/kamer/moment';
import { canMoveAnywhere } from '@/components/kamer/Verplaatsen';
import { PLEK_KINDS } from '@/lib/kamers/shape';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §103 herstel (ronde 66, na de design-review): de winkel, de kamer en `/you`.
 *
 * Wat hier bewaakt wordt, is wat stil kan slijten: een plek-icoon dat weer de
 * vorm van een soort krijgt, een *Gekocht* die weer overvloeit in rood, een
 * knop *Verplaatsen* die naar een doodlopende balk leidt, en een zin die niet
 * in `lib/words.ts` staat.
 */

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** De CSS-declaraties van één selector, zoals ze in het bestand staan (de laatste wint). */
function block(css: string, selector: string, first = false): string {
  const at = first ? css.indexOf(`${selector} {`) : css.lastIndexOf(`${selector} {`);
  expect(at, `${selector} staat niet in het bestand`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('#22: een plek heeft een eigen vorm, geen soort', () => {
  it('draws no plek with the icon of a soort the archive is seeded with', () => {
    const seed = read('lib/db/seed.mjs');
    const soortIcons = new Set([...seed.matchAll(/icon: '([a-z]+)'/g)].map((match) => match[1]));
    expect(soortIcons.has('pin'), 'de seed heeft zijn iconen verplaatst; pas deze test aan').toBe(true);
    for (const kind of PLEK_KINDS) {
      expect(soortIcons.has(plekIcon(kind)), `${kind} tekent ${plekIcon(kind)}, ook een soort`).toBe(false);
    }
  });

  it('draws a muur as a frame on a nail and a kist as a chest', () => {
    expect(plekIcon('muur')).toBe('frame');
    expect(plekIcon('kist')).toBe('chest');
    const icons = read('components/Icon.tsx');
    expect(icons).toContain('\n  frame:');
    expect(icons).toContain('\n  chest:');
  });
});

describe('#6: *Gekocht* is te zien', () => {
  it('waits for the stamp to land and then a --dur-5 before the row changes', () => {
    // Klik op 0, antwoord van de server op 100: de stempel landt op 240, en blijft 400.
    expect(holdBeforeRefresh(0, 100, 240, 400)).toBe(540);
    // Een trage server (antwoord op 900) wacht niet nóg eens de landing af.
    expect(holdBeforeRefresh(0, 900, 240, 400)).toBe(400);
    // Reduced motion: geen landing, wel de 400 ms om hem te zien.
    expect(holdBeforeRefresh(0, 50, 0, 400)).toBe(400);
  });

  it('has no transition on the bought button, so it is never red on red', () => {
    const css = read('app/kamer.css');
    const bought = block(css, '.btn.btn-primary.winkel-koop-gekocht:active');
    expect(bought).toContain('transition: none');
    expect(bought).toContain('background: var(--paper-raised)');
  });

  it('keeps a small Gekocht stamp in the owned line, from the words', () => {
    const rij = read('components/winkel/WinkelRij.tsx');
    expect(rij).toContain('winkel-gekocht-stempel');
    expect(rij).toContain('{words.buyBought}');
  });
});

describe('#7: een tegel die landt, plakt niet tegen de rand', () => {
  it('gives every plek a scroll margin', () => {
    expect(block(read('app/kamer.css'), '.plek')).toMatch(/scroll-margin-block: 6rem 5rem/);
  });
});

describe('#8: de chip in de winkelkiezer steekt niet buiten de pil', () => {
  it('sits beside the number, in the place of MUNTEN, and never above the beurs', () => {
    const css = read('app/moment.css');
    const chip = block(css, '.winkel-kiezer-saldo .beurs .saldo-chip-boven', true);
    expect(chip).toContain('top: 0');
    expect(chip).toContain('bottom: 0');
    expect(css).toContain('.winkel-kiezer-saldo .beurs:has(.saldo-chip:not([data-leaving])) .beurs-munt');
  });
});

describe('#18: de prijs één keer per rij', () => {
  it('says the price on the stamp and not on the button', () => {
    expect(DEFAULT_WORDS.buyShort).not.toContain('{n}');
    expect(fill(DEFAULT_WORDS.buyShort, { knop: 'Kopen', n: '2', plek: 'bureau' })).toBe('Kopen → bureau');
  });

  it('says one sentence when a plek has to be opened first', () => {
    const zin = DEFAULT_WORDS.shopOpenFirst;
    for (const gat of ['{plek}', '{n}', '{prijs}']) expect(zin).toContain(gat);
    expect(fill(zin, { plek: 'kist', n: '5', prijs: '4' })).toBe('Eerst een kist openen (5), dan 4');
    expect(zin).not.toContain('!');
  });

  it('keeps red for what you can do now', () => {
    const rij = read('components/winkel/WinkelRij.tsx');
    expect(rij).toMatch(/state === 'buy' \|\| state === 'list' \? '' : ' winkel-prijs-rustig'/);
    expect(read('app/kamer.css')).toContain('.winkel-prijs-rustig,\n.plek-prijs-rustig {');
  });
});

describe('#21: Verplaatsen alleen als er een plek is', () => {
  it('asks whether any open, empty plek fits', () => {
    expect(canMoveAnywhere(['muur', 'bureau'], [{ kind: 'plank' }, { kind: 'bureau' }])).toBe(true);
    expect(canMoveAnywhere(['muur'], [{ kind: 'plank' }, { kind: 'kist' }])).toBe(false);
    expect(canMoveAnywhere(['muur'], [])).toBe(false);
  });
});

describe('#24: /you — het geluid krijgt een zin', () => {
  it('has the hint in the words, in the archive’s voice', () => {
    expect(DEFAULT_WORDS.soundHint).toBe('Een tik, een munt, een stempel — alleen in de kamer en de winkel.');
    expect(read('components/kamer/KlankSchakelaar.tsx')).toContain('{words.soundHint}');
  });

  it('lines the preferences up on one label column on a wide screen', () => {
    const css = read('app/moment.css');
    expect(css).toContain('.you-prefs .you-pref-label {');
    expect(css).toContain('padding-left: calc(var(--you-label-kolom) + 0.4rem)');
  });
});

describe('#28: de deuren tussen winkel en kamer hebben één vorm', () => {
  it('draws both as a small button with an icon', () => {
    const winkel = read('app/(app)/winkel/page.tsx');
    const kamer = read('app/(app)/kamer/[slug]/page.tsx');
    expect(winkel).toMatch(/className="btn btn-small winkel-kamer-deur"[\s\S]{0,200}<Icon name=\{MEANING\.kamer\}/);
    expect(kamer).toMatch(/className="btn btn-small kamer-winkel-deur"[\s\S]{0,200}<Icon name=\{MEANING\.winkel\}/);
  });
});
