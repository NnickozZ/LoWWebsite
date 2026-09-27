import { describe, expect, it } from 'vitest';
import { AUTHOR_GATE_OFF, gateAsks } from '@/lib/canvas/authorGate';
import { SECTION_TEXT_SELECTOR, movesToSectionText } from '@/lib/entries/sectionTab';
import { FIT_PADDING, followPoint, panIntoView } from '@/lib/canvas/view';

/**
 * §101, ronde 64 — de pure helften van wat de handelingsmeting na golf 3 vond.
 *
 * Wat hier getoetst wordt is de rékensom en de regel; dat de knoppen ze ook
 * echt gebruiken staat in `tests/e2e/ronde-64-meting.spec.ts`.
 */

/**
 * A stand-in for a DOM element: what `gateAsks` reads, and nothing else.
 * `inside` is the list of selectors this element would answer `closest` for.
 */
function el(
  props: Partial<{ tagName: string; type: string; readOnly: boolean; isContentEditable: boolean }>,
  inside: readonly string[] = [],
) {
  return {
    ...props,
    closest: (selector: string) => (inside.includes(selector) ? {} : null),
  } as unknown as EventTarget;
}

const OFF = '[data-author-gate="off"]';
const SHEET = '.sheet-backdrop';

describe('§101 een maakknop op een balk vraagt niet op de weg naar beneden', () => {
  it('draagt het kenmerk dat `gateAsks` leest', () => {
    // `useCanvasMaker` spreidt precies dit, plus een `onClick` die eerst
    // vraagt. Het kenmerk en de vraag horen bij elkaar en worden samen
    // uitgedeeld — dit is de helft die een test kan vastpakken.
    expect(AUTHOR_GATE_OFF['data-author-gate']).toBe('off');
  });

  it('een knop op een balk met dat kenmerk vraagt niets, ook in Bewerken', () => {
    expect(gateAsks(true, el({ tagName: 'BUTTON' }, [OFF]))).toBe(false);
    // En zonder het kenmerk vroeg hij het wél — dat is de bug die gemeten is.
    expect(gateAsks(true, el({ tagName: 'BUTTON' }))).toBe(true);
  });
});

describe('§101 een blad over het glas is het glas niet', () => {
  it('vraagt niets als een blad de focus pakt', () => {
    // Het paneel van een `Sheet` (tabIndex -1) — daar typ je niet in. Het blad
    // hangt in een portal, maar React stuurt zijn gebeurtenissen langs de
    // React-boom, dus het viel onder de schrijfvraag van het vlak.
    expect(gateAsks(true, el({ tagName: 'DIV' }, [SHEET]))).toBe(false);
    expect(gateAsks(true, el({ tagName: 'BUTTON' }, [SHEET]))).toBe(false);
  });

  it('vraagt het wél zodra je in een vak van dat blad typt', () => {
    expect(gateAsks(true, el({ tagName: 'INPUT', type: 'text' }, [SHEET]))).toBe(true);
    expect(gateAsks(false, el({ isContentEditable: true }, [SHEET]))).toBe(true);
  });

  it('en `off` wint nog steeds, ook in een blad', () => {
    expect(gateAsks(true, el({ tagName: 'INPUT', type: 'text' }, [SHEET, OFF]))).toBe(false);
  });

  it('laat het glas zelf met rust — daar verandert niets', () => {
    expect(gateAsks(true, el({ tagName: 'DIV' }))).toBe(true);
    expect(gateAsks(false, el({ tagName: 'DIV' }))).toBe(false);
  });
});

describe('§101 Tab van de sectietitel naar de sectietekst', () => {
  it('is een kale Tab, vooruit', () => {
    expect(movesToSectionText({ key: 'Tab' })).toBe(true);
    expect(movesToSectionText({ key: 'Tab', shiftKey: false })).toBe(true);
  });

  it('laat Shift+Tab en elke Tab met een andere toets erbij met rust', () => {
    expect(movesToSectionText({ key: 'Tab', shiftKey: true })).toBe(false);
    expect(movesToSectionText({ key: 'Tab', ctrlKey: true })).toBe(false);
    expect(movesToSectionText({ key: 'Tab', metaKey: true })).toBe(false);
    expect(movesToSectionText({ key: 'Tab', altKey: true })).toBe(false);
    expect(movesToSectionText({ key: 'Enter' })).toBe(false);
    expect(movesToSectionText({ key: 'a' })).toBe(false);
  });

  it('wijst de tekst aan en niet de titel', () => {
    // De titel is een `<input>`; de tekst is de editor eronder.
    expect(SECTION_TEXT_SELECTOR).toContain('contenteditable');
    expect(SECTION_TEXT_SELECTOR).toContain('.editor-body');
  });
});

describe('§101 de camera blijft staan terwijl de wereld eronder schuift', () => {
  const view = { x: 100, y: 50, zoom: 2 };

  it('houdt een wereldpunt op dezelfde plek van het glas', () => {
    // Het kaartje stond op (10, 10) en staat nu op (10, 130): één generatie
    // erbij duwt iedereen omlaag. Op het glas hoort het niet te bewegen.
    const next = followPoint(view, { x: 10, y: 10 }, { x: 10, y: 130 });
    expect(next.x + 10 * next.zoom).toBe(view.x + 10 * view.zoom);
    expect(next.y + 130 * next.zoom).toBe(view.y + 10 * view.zoom);
    expect(next.zoom).toBe(view.zoom);
  });

  it('zoomt nooit, en laat een wereld die niet schoof met rust', () => {
    const same = followPoint(view, { x: 4, y: 7 }, { x: 4, y: 7 });
    expect(same).toEqual({ x: 100, y: 50, zoom: 2 });
  });

  it('gaat niet stuk op een getal dat er niet is', () => {
    expect(followPoint(view, { x: NaN, y: 0 }, { x: 0, y: 0 })).toBe(view);
    expect(followPoint(view, { x: 0, y: 0 }, { x: 0, y: Infinity })).toBe(view);
  });
});

describe('§101 het nieuwe kaartje komt in beeld', () => {
  const stage = { width: 1000, height: 800 };
  const flat = { x: 0, y: 0, zoom: 1 };

  it('schuift niets als de doos er al helemaal op staat', () => {
    const box = { x: 400, y: 300, width: 200, height: 120 };
    expect(panIntoView(flat, box, stage)).toBe(flat);
  });

  it('schuift het minst dat nodig is, met lucht om de doos', () => {
    // Een doos die er rechts af valt komt er net op, met `FIT_PADDING` lucht.
    const box = { x: 940, y: 300, width: 200, height: 120 };
    const next = panIntoView(flat, box, stage);
    const right = next.x + (box.x + box.width) * next.zoom;
    expect(right).toBeCloseTo(stage.width - FIT_PADDING, 5);
    expect(next.y).toBe(flat.y);
    expect(next.zoom).toBe(flat.zoom);
  });

  it('rekent in schermpixels, dus de zoom telt mee', () => {
    const zoomed = { x: 0, y: 0, zoom: 2 };
    const box = { x: 470, y: 0, width: 100, height: 100 };
    const next = panIntoView(zoomed, box, stage);
    expect(next.x + (box.x + box.width) * 2).toBeCloseTo(stage.width - FIT_PADDING, 5);
  });

  it('legt een doos die groter is dan het glas met zijn hoek tegen de rand', () => {
    const big = { x: 900, y: 900, width: 2000, height: 2000 };
    const next = panIntoView(flat, big, stage);
    expect(next.x + big.x).toBe(0);
    expect(next.y + big.y).toBe(0);
  });

  it('doet niets zonder een gemeten glas', () => {
    expect(panIntoView(flat, { x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toBe(flat);
  });

  it('duwt het kaartje waar je mee bezig was niet van het glas', () => {
    // Het nieuwe kaartje ligt boven het glas; het oude staat er net op.
    const nieuw = { x: 100, y: -400, width: 200, height: 120 };
    const oud = { x: 100, y: 40, width: 200, height: 700 };
    const zonder = panIntoView(flat, nieuw, stage);
    expect(zonder.y).toBeGreaterThan(0);
    // Met `hold` mag er hoogstens zoveel geschoven worden als het oude kaartje
    // op het glas houdt: hier 800 − 740 = 60 px.
    const met = panIntoView(flat, nieuw, stage, FIT_PADDING, oud);
    expect(met.y).toBe(60);
  });

  it('schuift niets als het oude kaartje zelf al niet past', () => {
    const nieuw = { x: 100, y: -400, width: 200, height: 120 };
    const reus = { x: 0, y: -50, width: 200, height: 2000 };
    expect(panIntoView(flat, nieuw, stage, FIT_PADDING, reus)).toBe(flat);
  });
});
