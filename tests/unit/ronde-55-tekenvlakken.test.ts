import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameraStoreKey, CHOICE_PARAM, freshHref, isFreshHref, withChoice } from '@/lib/canvas/memory';
import { centreView, fitViewport, MIN_ZOOM, readableFit, readingFloor, READ_MIN_PX } from '@/lib/canvas/view';
import { findOnCanvas } from '@/lib/canvas/find';
import { goToView, parseGoTo, spanWords } from '@/lib/timelines/span';
import { maxPxPerSecond, partsToSeconds, UNIT_SECONDS } from '@/lib/timelines/time';
import { DEFAULT_WORDS, WORD_GROUPS } from '@/lib/words';

/**
 * Ronde 55 (§94) — de tekenvlakken, vinden en terug.
 *
 * The pure halves of what this round built: the address that carries a choice
 * (C5) and the one-shot `?new=1` (O1), the readable start (C7), finding on a
 * wall or a tree (C4), and the tijdlijn's span in words and jump to a date
 * (C7, C16). The browser halves are `tests/e2e/ronde-55-tekenvlakken.spec.ts`.
 */

describe('§94 C5: de keuze staat in het adres', () => {
  it('one parameter per surface, and never the same one twice', () => {
    expect(CHOICE_PARAM).toEqual({ board: 'card', map: 'pin', timeline: 'event', family_tree: 'node' });
    expect(new Set(Object.values(CHOICE_PARAM)).size).toBe(4);
  });

  it('sets, replaces and removes one parameter and leaves the rest alone', () => {
    expect(withChoice('/maps/zeeland', 'pin', 'p1')).toBe('/maps/zeeland?pin=p1');
    expect(withChoice('/maps/zeeland?pin=p1', 'pin', 'p2')).toBe('/maps/zeeland?pin=p2');
    expect(withChoice('/maps/zeeland?place=e1&pin=p1', 'pin', null)).toBe('/maps/zeeland?place=e1');
    expect(withChoice('/maps/zeeland?pin=p1', 'pin', null)).toBe('/maps/zeeland');
    expect(withChoice('/stambomen/x#top', 'node', 'entry:abc')).toBe('/stambomen/x?node=entry%3Aabc#top');
  });

  it('keeps a camera per surface and per record', () => {
    expect(cameraStoreKey('board', 'b1')).not.toBe(cameraStoreKey('map', 'b1'));
    expect(cameraStoreKey('family_tree', 't1')).toBe('canvas:family_tree:t1:camera');
  });

  it('the stamboom keeps no camera in localStorage any more — one road for all four', () => {
    const tree = readFileSync(resolve(__dirname, '../../components/families/FamilyTreeCanvas.tsx'), 'utf8');
    expect(tree).not.toMatch(/localStorage\.(get|set)Item\(viewKey/);
    for (const file of [
      'components/boards/BoardCanvas.tsx',
      'components/maps/MapCanvas.tsx',
      'components/timelines/TimelineCanvas.tsx',
      'components/families/FamilyTreeCanvas.tsx',
    ]) {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(source, file).toMatch(/readCamera\(/);
      expect(source, file).toMatch(/writeCamera\(/);
      expect(source, file).toMatch(/writeChoice\(/);
    }
  });
});

describe('§94 O1: een vlak dat je net maakte opent in Bewerken', () => {
  it('the maker adds ?new=1 and the mode reads it', () => {
    expect(freshHref('/b/abc')).toBe('/b/abc?new=1');
    expect(freshHref('/maps/x?pin=1')).toBe('/maps/x?pin=1&new=1');
    expect(isFreshHref('?new=1')).toBe(true);
    expect(isFreshHref('?pin=1&new=1')).toBe(true);
    expect(isFreshHref('?new=0')).toBe(false);
    expect(isFreshHref('')).toBe(false);
  });

  it('all four makers send it', () => {
    for (const file of [
      'components/boards/NewBoardButton.tsx',
      'components/maps/NewMapButton.tsx',
      'components/timelines/NewTimelineButton.tsx',
      'components/families/NewFamilyTreeSheet.tsx',
    ]) {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(source, file).toMatch(/router\.push\(freshHref\(/);
    }
  });
});

describe('§94 C7: een leesbaar begin', () => {
  const stage = { width: 400, height: 600 };

  it('the floor is where a name is ten pixels', () => {
    expect(readingFloor(14)).toBeCloseTo(READ_MIN_PX / 14);
    expect(readingFloor(0)).toBe(MIN_ZOOM);
  });

  it('a world that fits above the floor is simply fitted', () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
    expect(readableFit(bounds, stage, 0.7)).toEqual(fitViewport(bounds, stage));
  });

  it('a world too big to read starts at its top-left, at the floor', () => {
    const bounds = { minX: 100, minY: 50, maxX: 5100, maxY: 3050 };
    const view = readableFit(bounds, stage, 0.7);
    expect(view.zoom).toBeCloseTo(0.7);
    // The world's top-left corner is at the padding, not off the glass.
    expect(view.x + bounds.minX * view.zoom).toBeCloseTo(48);
    expect(view.y + bounds.minY * view.zoom).toBeCloseTo(48);
  });

  it('an axis that does fit at the floor stays centred', () => {
    const bounds = { minX: 0, minY: 0, maxX: 5000, maxY: 100 };
    const view = readableFit(bounds, stage, 0.7);
    expect(view.x).toBeCloseTo(48);
    expect(view.y + (100 * view.zoom) / 2).toBeCloseTo(stage.height / 2);
  });

  it('the ceiling still wins over the floor (the wall stops at 1.2)', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
    expect(readableFit(bounds, stage, 2, 48, 1.2).zoom).toBe(1.2);
  });

  it('centreView puts a world point in the middle of the glass', () => {
    const view = centreView({ x: 500, y: 300 }, stage, 1);
    expect(view.x + 500 * view.zoom).toBeCloseTo(200);
    expect(view.y + 300 * view.zoom).toBeCloseTo(300);
  });
});

describe('§94 C4: vinden op het vlak', () => {
  const items = [
    { id: 'a', name: 'Boone' },
    { id: 'b', name: 'Jacob den Hollander' },
    { id: 'c', name: '' },
    { id: 'd', name: 'Westkapelle Lighthouse' },
  ];

  it('finds by name, best first, and offers nothing for nothing typed', () => {
    expect(findOnCanvas(items, '')).toEqual([]);
    expect(findOnCanvas(items, 'boon').map((i) => i.id)).toEqual(['a']);
    expect(findOnCanvas(items, 'west')[0].id).toBe('d');
  });

  it('never offers a thing without a name', () => {
    expect(findOnCanvas(items, 'e').some((i) => i.id === 'c')).toBe(false);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Kaart ${i}` }));
    expect(findOnCanvas(many, 'kaart')).toHaveLength(8);
    expect(findOnCanvas(many, 'kaart', 3)).toHaveLength(3);
  });
});

describe('§94 C7/C16: de tijdlijn in woorden, en een sprong naar een datum', () => {
  it('says how much time is on the glass', () => {
    expect(spanWords(6 * UNIT_SECONDS.month)).toBe('≈ 6 maanden');
    expect(spanWords(3 * UNIT_SECONDS.day)).toBe('≈ 3 dagen');
    expect(spanWords(18 * UNIT_SECONDS.month)).toBe('≈ 18 maanden');
    expect(spanWords(250 * UNIT_SECONDS.year)).toBe('≈ 2,5 eeuwen');
    expect(spanWords(0)).toBe('—');
  });

  it('every step of the zoom buttons changes the words', () => {
    let seconds = 40 * UNIT_SECONDS.year;
    let before = spanWords(seconds);
    for (let i = 0; i < 40; i += 1) {
      seconds /= 1.25;
      const now = spanWords(seconds);
      expect(now, `${seconds} s`).not.toBe(before);
      before = now;
    }
  });

  it('reads a year, a month and a year, and a whole date', () => {
    expect(parseGoTo('1934')).toEqual({ at: partsToSeconds({ year: 1934 }), precision: 'year' });
    expect(parseGoTo('1934-3')).toEqual({ at: partsToSeconds({ year: 1934, month: 3 }), precision: 'month' });
    expect(parseGoTo('3-1934')).toEqual({ at: partsToSeconds({ year: 1934, month: 3 }), precision: 'month' });
    expect(parseGoTo('maart 1934')?.precision).toBe('month');
    expect(parseGoTo('14 maart 1934')?.precision).toBe('day');
    expect(parseGoTo('gisteren')).toBeNull();
    expect(parseGoTo('1934-13')).toBeNull();
  });

  it('puts the moment in the middle, its unit filling most of the glass', () => {
    const at = partsToSeconds({ year: 1934 });
    const view = goToView(at, 'year', 900, 'day');
    const middle = view.origin + 450 / view.pxPerSecond;
    expect(middle).toBeCloseTo(at + UNIT_SECONDS.year / 2, 0);
    expect(900 / view.pxPerSecond).toBeCloseTo(UNIT_SECONDS.year * 1.5, 0);
  });

  it('never zooms past what the buttons could reach', () => {
    const view = goToView(partsToSeconds({ year: 1934, month: 3, day: 14 }), 'day', 900, 'year');
    expect(view.pxPerSecond).toBeLessThanOrEqual(maxPxPerSecond('year'));
  });
});

describe('§94: de woorden', () => {
  const group = WORD_GROUPS.find((one) => one.title === 'Tekenvlakken: vinden en terug');

  it('are one group of their own', () => {
    expect(group).toBeTruthy();
  });

  it('are all under sixty characters, so a Keeper can write them back', () => {
    for (const word of group!.words) expect(word.fallback.length, word.key).toBeLessThanOrEqual(60);
  });

  it('keep the gaps the components fill', () => {
    expect(DEFAULT_WORDS.entryInTree).toContain('{stamboom}');
    expect(DEFAULT_WORDS.entryInTree).toContain('{naam}');
    expect(DEFAULT_WORDS.findOnBoard).toContain('{prikbord}');
    expect(DEFAULT_WORDS.findOnTree).toContain('{stamboom}');
  });
});
