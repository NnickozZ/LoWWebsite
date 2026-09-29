import { describe, expect, it } from 'vitest';
import { gateAsks, gatePress, PRESS_SLOP } from '@/lib/canvas/authorGate';
import { FIND_ROOM_MIN, findListRoom } from '@/lib/canvas/find';
import { boxOnGlass, panIntoView, panToBring } from '@/lib/canvas/view';

/**
 * §105 (golf J, j1) — de pure helften van wat de meting na golf I op de
 * vlakken vond: de vraag bij lezen in Bewerken (stuk 2b/3, raden 1), de loep
 * boven het toetsenbord (stuk 1) en de nieuwe ouder buiten beeld (stuk 8).
 * Dat de vlakken ze ook echt gebruiken, staat in
 * `tests/e2e/golf-j1-vlakken.spec.ts`.
 */

type Node = { name: string; contains?: (other: unknown) => boolean };

/**
 * A stand-in for a DOM element. `inside` maps each selector this element sits
 * under to the ancestor that answers it, so `closest('a, b')` finds the first
 * of the listed parts, as the DOM does for the nearest one.
 */
function el(
  props: Partial<{ tagName: string; type: string; isContentEditable: boolean }>,
  inside: Record<string, Node> = {},
) {
  return {
    ...props,
    closest: (selector: string) => {
      for (const part of selector.split(',').map((one) => one.trim())) {
        if (inside[part]) return inside[part];
      }
      return null;
    },
  } as unknown as EventTarget;
}

const WHERE = { glass: '.board-viewport', things: '.board-card, .board-string' };
const glass: Node = { name: 'glass' };
const card: Node = { name: 'card', contains: (other) => other === inner };
const inner: Node = { name: 'button in card' };

describe('§105 (golf J) lezen in Bewerken vraagt niet wie er schrijft', () => {
  it('een klik op een kaart om te lezen vraagt niets; een sleep wel (on-move)', () => {
    const onCard = el({ tagName: 'DIV' }, { '.board-viewport': glass, '.board-card': card });
    expect(gatePress(true, onCard, WHERE)).toBe('on-move');
    // …en in Lezen nooit, zoals altijd (§90).
    expect(gatePress(false, onCard, WHERE)).toBe('never');
  });

  it('een speld die zelf een knop is, is een ding en geen knop', () => {
    const pin: Node = { name: 'pin', contains: () => false };
    const onPin = el({ tagName: 'BUTTON' }, { '.board-viewport': glass, '.board-card': pin, button: pin });
    expect(gatePress(true, onPin, WHERE)).toBe('on-move');
  });

  it('de naam van een kaart is een link, en een kaart sleep je aan zijn naam: het ding eerst', () => {
    const onName = el({ tagName: 'A' }, { '.board-viewport': glass, '.board-card': card, 'a[href]': { name: 'name' } });
    expect(gatePress(true, onName, WHERE)).toBe('on-move');
  });

  it('een knop ín een kaart vraagt zoals een knop altijd vroeg', () => {
    const onInner = el({ tagName: 'BUTTON' }, { '.board-viewport': glass, '.board-card': card, button: inner });
    expect(gatePress(true, onInner, WHERE)).toBe('now');
  });

  it('kaal papier is pannen: nooit de vraag (wat daar maakt, vraagt zelf)', () => {
    expect(gatePress(true, el({ tagName: 'DIV' }, { '.board-viewport': glass }), WHERE)).toBe('never');
  });

  it('het potlood schrijft bij de eerste aanraking', () => {
    const ink = el({ tagName: 'CANVAS' }, { '.board-viewport': glass, '.ink-capture': { name: 'ink' } });
    expect(gatePress(true, ink, WHERE)).toBe('now');
  });

  it('een link leest, in welke stand ook — ook *Artikel openen* op een speld', () => {
    const link = el({ tagName: 'A' }, { 'a[href]': { name: 'link' } });
    expect(gatePress(true, link, WHERE)).toBe('never');
    expect(gateAsks(true, link)).toBe(false);
    // Een vak blijft een vak, ook als het een link zou dragen.
    expect(gateAsks(true, el({ isContentEditable: true }, { 'a[href]': { name: 'link' } }))).toBe(true);
  });

  it('een vak vraagt altijd, ook op het glas', () => {
    const box = el({ tagName: 'INPUT', type: 'text' }, { '.board-viewport': glass });
    expect(gatePress(true, box, WHERE)).toBe('now');
    expect(gatePress(false, box, WHERE)).toBe('now');
  });

  it('buiten het glas (een balk, een paneel) is de oude regel', () => {
    const bar = el({ tagName: 'BUTTON' });
    expect(gatePress(true, bar, WHERE)).toBe('now');
    expect(gatePress(true, el({ tagName: 'BUTTON' }, { '[data-author-gate="off"]': { name: 'off' } }), WHERE)).toBe(
      'never',
    );
  });

  it('zonder `where` is het precies `gateAsks`', () => {
    const btn = el({ tagName: 'BUTTON' });
    expect(gatePress(true, btn)).toBe('now');
    expect(gatePress(false, btn)).toBe('never');
  });

  it('een sleep begint pas na een paar pixels', () => {
    expect(PRESS_SLOP).toBeGreaterThan(0);
    expect(PRESS_SLOP).toBeLessThanOrEqual(8);
  });
});

describe('§105 (golf J) de treffers van Vind staan boven het toetsenbord', () => {
  it('zonder toetsenbord stopt de lijst boven de tabbalk', () => {
    // 390×844, tabbalk op 785, lijst begint op 228.
    expect(findListRoom({ top: 228, viewBottom: 844, barTop: 785 })).toBe(785 - 228 - 8);
  });

  it('met een toetsenbord stopt hij boven het toetsenbord', () => {
    // Het toetsenbord neemt 336 px: wat je ziet eindigt op 508; de tabbalk ligt eronder.
    expect(findListRoom({ top: 228, viewBottom: 508, barTop: 785 })).toBe(508 - 228 - 8);
  });

  it('nooit minder dan twee rijen', () => {
    expect(findListRoom({ top: 480, viewBottom: 508, barTop: null })).toBe(FIND_ROOM_MIN);
  });
});

describe('§105 (golf J) de nieuwe ouder staat in beeld', () => {
  const stage = { width: 350, height: 500 };
  // Ingezoomd (zoom 1): Willemijn onderaan in beeld, haar nieuwe ouder een
  // generatie hoger — samen hoger dan het glas.
  const view = { x: 0, y: -600, zoom: 1 };
  const anchor = { x: 100, y: 900, width: 150, height: 180 };
  const parent = { x: 100, y: 300, width: 150, height: 180 };

  it('past het samen niet, dan houdt `panIntoView` de oude kaart en blijft de nieuwe weg', () => {
    const held = panIntoView(view, parent, stage, 24, anchor);
    expect(boxOnGlass(held, parent, stage)).toBe(false);
  });

  it('`panToBring` laat de nieuwe winnen, zonder te zoomen', () => {
    const next = panToBring(view, parent, stage, 24, anchor);
    expect(boxOnGlass(next, parent, stage)).toBe(true);
    expect(next.zoom).toBe(view.zoom);
  });

  it('past het wél samen, dan staan ze er allebei', () => {
    const near = { x: 100, y: 700, width: 150, height: 180 };
    const roomy = { width: 350, height: 800 };
    const next = panToBring(view, near, roomy, 24, anchor);
    expect(boxOnGlass(next, near, roomy)).toBe(true);
    expect(boxOnGlass(next, anchor, roomy)).toBe(true);
  });
});
