import { describe, expect, it } from 'vitest';
import { clampFloat, clampInside, flipsNeeded, FLOAT_BELOW, FLOAT_MARGIN } from '@/lib/canvas/clamp';

/**
 * §69 (3.4): waar een zwevend paneel op een tekenvlak terechtkomt.
 *
 * Round 31 left two named leftovers on the stamboom — a kiezer clamped against
 * a guessed height, and a knoopmenu that was not clamped at all — and the
 * reason both survived four rounds is that the arithmetic was written inside a
 * `style={{}}`, where nothing could ask it a question. It is a module now, and
 * these are the questions.
 */

const STAGE = { width: 1000, height: 600 };

describe('§69 clampFloat — een paneel in stage-coördinaten', () => {
  const size = { width: 280, height: 200 };

  it('hangt het onder het punt en centreert het erop', () => {
    const placed = clampFloat({ x: 500, y: 100 }, size, STAGE);
    expect(placed).toEqual({ left: 500 - 140, top: 100 + FLOAT_BELOW, flipped: false });
  });

  it('duwt het naar binnen bij de linker- en rechterrand', () => {
    expect(clampFloat({ x: 4, y: 100 }, size, STAGE).left).toBe(FLOAT_MARGIN);
    expect(clampFloat({ x: 996, y: 100 }, size, STAGE).left).toBe(1000 - 280 - FLOAT_MARGIN);
  });

  it('klapt het boven het punt zodra het er onder niet meer bij kan', () => {
    // 500 + 12 + 200 = 712, ruim voorbij de 600 van het glas.
    const placed = clampFloat({ x: 500, y: 500 }, size, STAGE);
    expect(placed.flipped).toBe(true);
    expect(placed.top).toBe(500 - FLOAT_BELOW - 200);
  });

  it('klapt liever dan te schuiven, want schuiven legt het over de kaart', () => {
    /*
     * The distinction this test exists for: a panel that merely slid up until
     * it fitted would end up lying over the card it was opened from — which is
     * the one thing you want to keep looking at while you pick a relative.
     */
    const slid = clampFloat({ x: 500, y: 500 }, size, STAGE);
    expect(slid.top + 200).toBeLessThan(500);
  });

  it('geeft het op als het nergens past, maar blijft binnen de marge', () => {
    const tall = { width: 280, height: 900 };
    const placed = clampFloat({ x: 500, y: 500 }, tall, STAGE);
    expect(placed.top).toBe(FLOAT_MARGIN);
    expect(placed.flipped).toBe(false);
  });

  it('wordt niet negatief op een glas dat kleiner is dan het paneel', () => {
    // A phone held sideways is exactly this, and it is not an error.
    const placed = clampFloat({ x: 50, y: 50 }, size, { width: 200, height: 150 });
    expect(placed.left).toBe(FLOAT_MARGIN);
    expect(placed.top).toBeGreaterThanOrEqual(FLOAT_MARGIN);
  });

  it('is het verschil dat de gok van 200 verborg', () => {
    // A kiezer with two schimmen, a search box and a name field is ~330 px. At
    // y = 380 the guess said "fits", the measurement says "flip".
    const guessed = clampFloat({ x: 500, y: 380 }, { width: 280, height: 200 }, STAGE);
    const measured = clampFloat({ x: 500, y: 380 }, { width: 280, height: 330 }, STAGE);
    expect(guessed.flipped).toBe(false);
    expect(measured.flipped).toBe(true);
  });
});

describe('§69 flipsNeeded — een paneel dat aan een anker in de wereld hangt', () => {
  const stage = { top: 0, right: 1000, bottom: 600, left: 0 };

  it('laat het met rust als het past', () => {
    expect(flipsNeeded({ top: 100, right: 400, bottom: 260, left: 200 }, stage)).toEqual({
      up: false,
      start: false,
      end: false,
    });
  });

  it('klapt omhoog als de onderkant erbuiten valt en er boven ruimte is', () => {
    // 160 hoog, onderkant op 620: eronder past het niet, erboven wel (400 > 160).
    expect(flipsNeeded({ top: 460, right: 400, bottom: 620, left: 200 }, stage).up).toBe(true);
  });

  it('klapt niet omhoog als het daar ook niet past', () => {
    // 560 hoog en bovenaan begonnen: beide kanten te klein, dus laat staan en
    // laat het glas het maar afsnijden — een menu dat omhoog klapt en dán pas
    // wordt afgesneden is geen verbetering.
    expect(flipsNeeded({ top: 60, right: 400, bottom: 620, left: 200 }, stage).up).toBe(false);
  });

  it('lijnt rechts uit als het rechts uitsteekt, en links als het links uitsteekt', () => {
    expect(flipsNeeded({ top: 100, right: 1010, bottom: 200, left: 800 }, stage).end).toBe(true);
    expect(flipsNeeded({ top: 100, right: 200, bottom: 200, left: 2 }, stage).start).toBe(true);
  });

  it('kiest één kant als het aan allebei uitsteekt', () => {
    // Breder dan het glas: dan wint rechts, want daar hangt de `…` waar het
    // aan vastzit. Twee kanten tegelijk zou het paneel in zichzelf duwen.
    const both = flipsNeeded({ top: 100, right: 1200, bottom: 200, left: -100 }, stage);
    expect(both.end).toBe(true);
    expect(both.start).toBe(false);
  });
});

describe('§69 clampInside — een paneel dat al ergens neergezet is', () => {
  const size = { width: 320, height: 300 };

  it('laat de wens staan als hij past', () => {
    expect(clampInside({ x: 100, y: 100 }, size, STAGE)).toEqual({ left: 100, top: 100 });
  });

  it('trekt hem naar binnen bij de rechter- en onderrand', () => {
    expect(clampInside({ x: 900, y: 500 }, size, STAGE)).toEqual({
      left: 1000 - 320 - FLOAT_MARGIN,
      top: 600 - 300 - FLOAT_MARGIN,
    });
  });

  it('is het verschil dat de gok van 90 verborg', () => {
    /*
     * The prikbord's floating kiezer clamped its top against a guessed height
     * of 90 for a box that is ~300 with six suggestions in it. At y = 480 the
     * guess said "fits" and the cork — which clips — ate the lower two thirds.
     */
    const guessed = clampInside({ x: 100, y: 480 }, { width: 320, height: 90 }, STAGE);
    const measured = clampInside({ x: 100, y: 480 }, size, STAGE);
    expect(guessed.top).toBe(480);
    expect(measured.top).toBe(600 - 300 - FLOAT_MARGIN);
  });

  it('wordt niet negatief op een glas dat kleiner is dan het paneel', () => {
    expect(clampInside({ x: 40, y: 40 }, size, { width: 200, height: 150 })).toEqual({
      left: FLOAT_MARGIN,
      top: FLOAT_MARGIN,
    });
  });
});
