import { describe, expect, it } from 'vitest';
import {
  isBarePaper,
  pressWandered,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
} from '@/components/canvas/useMakeOnEmpty';

/**
 * §69: bare paper makes the thing this surface is for — the two decisions
 * behind that, asked without a browser.
 *
 * `tests/e2e/canvas-contract.spec.ts` asserts the *wiring*: that each of the
 * three canvases hung the hook on its stage, through the double-click, which
 * Playwright can drive. It cannot drive the other road. `page.touchscreen` taps
 * and drags; there is no press-and-hold, which is why §62's long press on the
 * tijdlijn went four rounds with no e2e touching it at all. So the timer's own
 * rules live here.
 *
 * A stub with a `closest` rather than a DOM: the vitest run in this repo is
 * plain Node (no jsdom, no testing-library), and `isBarePaper` was written to
 * take anything that can answer `closest` precisely so it could be asked this
 * way.
 */

/** Pretends to be an element whose ancestors match `matches`. */
function target(...matches: string[]) {
  return {
    closest: (selector: string) =>
      selector
        .split(',')
        .map((part) => part.trim())
        .some((part) => matches.includes(part))
        ? {}
        : null,
  };
}

describe('§69 wat leeg papier is', () => {
  const BOARD =
    '.board-card, .board-string, .board-string-hit, .board-grip, .board-handle, .board-inspector, .board-picker';

  it('zegt ja voor het papier zelf', () => {
    expect(isBarePaper(target(), BOARD)).toBe(true);
    expect(isBarePaper(target('.board-viewport', '.board-world'), BOARD)).toBe(true);
  });

  it('zegt nee voor alles wat de plek zelf noemt', () => {
    expect(isBarePaper(target('.board-card'), BOARD)).toBe(false);
    expect(isBarePaper(target('.board-string-hit'), BOARD)).toBe(false);
    expect(isBarePaper(target('.board-inspector'), BOARD)).toBe(false);
  });

  it('houdt het potlood er altijd buiten, ook als de plek het vergeet', () => {
    /*
     * §33: two quick dots with the potlood are two dots, not a new anything.
     * The hook adds these two itself so a canvas cannot forget them — which is
     * the whole reason this is a shared function rather than four selectors.
     */
    expect(isBarePaper(target('.ink-capture'), BOARD)).toBe(false);
    expect(isBarePaper(target('.ink-toolbar'), BOARD)).toBe(false);
    expect(isBarePaper(target('.ink-capture'), '.nothing-at-all')).toBe(false);
  });

  it('laat een doel dat niets weet door', () => {
    // A synthetic event, or a target that is not an element: the surface's own
    // `enabled` is the real gate, and refusing here would silently kill the
    // gesture rather than fail loudly.
    expect(isBarePaper(null, BOARD)).toBe(true);
    expect(isBarePaper(undefined, BOARD)).toBe(true);
  });
});

describe('§69 de vinger die afdwaalt', () => {
  it('blijft een druk zolang hij stilstaat', () => {
    expect(pressWandered({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
    expect(pressWandered({ x: 100, y: 100 }, { x: 105, y: 100 })).toBe(false);
  });

  it('wordt een pan zodra hij verder gaat dan de marge', () => {
    expect(pressWandered({ x: 100, y: 100 }, { x: 109, y: 100 })).toBe(true);
    expect(pressWandered({ x: 100, y: 100 }, { x: 100, y: 91 })).toBe(true);
  });

  it('meet schuin, niet per as', () => {
    // 6 across and 6 down is 8.49 away — over the fence, though neither axis
    // is. Measuring per axis was the bug this shape avoids.
    expect(pressWandered({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(true);
    expect(pressWandered({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
  });

  it('houdt de twee getallen waar ze zijn', () => {
    // Named rather than asserted loosely: half a second is long enough that a
    // tap never trips it and short enough to feel deliberate, and eight pixels
    // is twice `DRAG_SLOP` because a finger is wider than a mouse.
    expect(LONG_PRESS_MS).toBe(500);
    expect(LONG_PRESS_SLOP).toBe(8);
  });
});
