import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelOffset, LABEL_H, placeLabels } from '@/lib/maps/labels';
import { placeTags, sideOfId } from '@/lib/timelines/time';

/**
 * Golf K: de open eindjes van golf J en drie dingen van Nick (29 september):
 * de omslag heel op een telefoon, de pagina in het midden op een computer, en
 * een tabrij op de voorpagina van de wiki waarin elke tab een pagina is.
 */

const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('golf K (M3): de namen op een landkaart', () => {
  it('zet een eenzame naam onder zijn kop, waar hij altijd stond', () => {
    const places = placeLabels([{ id: 'a', x: 200, y: 200, width: 80 }]);
    expect(places.get('a')).toEqual({ spot: 'onder', dx: 0, dy: 0 });
  });

  it('laat twee namen die elkaar raken niet op elkaar liggen', () => {
    // Twee spelden 60 px uit elkaar, namen van 110 px: onder elkaar zouden ze overlappen.
    const pins = [
      { id: 'achter', x: 200, y: 200, width: 110 },
      { id: 'voor', x: 260, y: 200, width: 110 },
    ];
    const places = placeLabels(pins);
    const box = (id: string) => {
      const pin = pins.find((p) => p.id === id)!;
      const place = places.get(id)!;
      return { x: pin.x - pin.width / 2 + place.dx, y: pin.y - LABEL_H + place.dy, w: pin.width, h: LABEL_H, spot: place.spot };
    };
    const a = box('achter');
    const b = box('voor');
    // De voorste (laatst getekend) kiest eerst en houdt zijn plek onder de kop.
    expect(b.spot).toBe('onder');
    if (a.spot !== 'weg') {
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap).toBe(false);
    }
  });

  it('verbergt een naam die nergens past, behalve voor een gekozen speld', () => {
    // Vijf spelden op een kluitje: niet alle namen passen.
    const pins = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, x: 200 + i * 36, y: 200 + (i % 2) * 12, width: 130 }));
    const places = placeLabels(pins);
    expect([...places.values()].some((place) => place.spot === 'weg')).toBe(true);
    const chosen = placeLabels(pins.map((pin) => (pin.id === 'p0' ? { ...pin, chosen: true } : pin)));
    expect(chosen.get('p0')!.spot).not.toBe('weg');
  });

  it('laat een naam die nog niet gemeten is gewoon onder zijn kop', () => {
    const places = placeLabels([
      { id: 'a', x: 200, y: 200, width: 0 },
      { id: 'b', x: 205, y: 200, width: 0 },
    ]);
    expect(places.get('a')!.spot).toBe('onder');
    expect(places.get('b')!.spot).toBe('onder');
  });

  it('schuift rechts en links precies naast de kop', () => {
    expect(labelOffset('rechts', 100).dx).toBe(14 + 4 + 50);
    expect(labelOffset('links', 100).dx).toBe(-(14 + 4 + 50));
    expect(labelOffset('rechts', 100).dy).toBe(labelOffset('links', 100).dy);
  });

  it('is aangesloten in MapCanvas, met een translate en niet met een andere knop', () => {
    const source = read('components/maps/MapCanvas.tsx');
    expect(source).toContain('placeLabels(');
    expect(source).toContain('data-label=');
    const css = read('app/globals.css');
    expect(css).toMatch(/\.map-pin-label\[data-label='weg'\]/);
  });
});

describe('golf K (M2): lange namen op de tijdlijn op twee regels', () => {
  // Twee ids aan dezelfde kant, zodat ze elkaars banen kunnen raken.
  const ids = Array.from({ length: 40 }, (_, i) => `ev-${i}`);
  const up = ids.filter((id) => sideOfId(id) === 'up');

  it('geeft een label van twee regels twee banen', () => {
    const [a, b] = up;
    const spots = placeTags(
      [
        { id: a, x: 100, width: 150, lines: 2, oneLineWidth: 170 },
        { id: b, x: 110, width: 90 },
      ],
      4,
    );
    expect(spots.get(a)).toMatchObject({ lane: 0, lines: 2, hidden: false });
    // De tweede past niet in baan 0 én niet in baan 1: die zijn van de eerste.
    expect(spots.get(b)).toMatchObject({ lane: 2, hidden: false });
  });

  it('valt terug op één regel als er geen twee banen vrij zijn', () => {
    const [a, b] = up;
    const spots = placeTags(
      [
        { id: a, x: 100, width: 90 },
        { id: b, x: 110, width: 150, lines: 2, oneLineWidth: 170 },
      ],
      2,
    );
    expect(spots.get(b)).toMatchObject({ lane: 1, hidden: false });
    expect(spots.get(b)!.lines ?? 1).toBe(1);
  });

  it('laat de tagjes van één regel precies zoals ze waren', () => {
    const [a, b, c] = up;
    const spots = placeTags(
      [
        { id: a, x: 100, width: 100 },
        { id: b, x: 150, width: 100 },
        { id: c, x: 400, width: 100 },
      ],
      3,
    );
    expect(spots.get(a)).toEqual({ side: 'up', lane: 0, hidden: false });
    expect(spots.get(b)).toEqual({ side: 'up', lane: 1, hidden: false });
    expect(spots.get(c)).toEqual({ side: 'up', lane: 0, hidden: false });
  });
});

describe('golf K: de omslag, de pagina en de tabrij', () => {
  it('snijdt de omslag van een artikel nergens meer bij tot een liggende strook', () => {
    const cover = read('components/entry/CoverEditor.tsx');
    expect(cover).not.toContain('entry-cover-liggend');
    expect(cover).toContain('width={size?.width}');
    const view = read('components/entry/EntryView.tsx');
    expect(view).not.toContain('landscape=');
    const css = read('app/leeskamer.css');
    expect(css).not.toMatch(/\.entry-cover-liggend\s*\{/);
    expect(css).toContain('/* ===== golf k */');
  });

  it('zet de pagina in het midden van wat naast de zijbalk over is', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/\.page \{\s*max-width: 900px;\s*margin: 0 auto;/);
    expect(css).toMatch(/\.page-wide \{\s*max-width: 1440px;\s*margin: 0 auto;/);
  });

  it('heeft op de voorpagina van de wiki geen tab meer die alleen naar beneden springt', () => {
    const tabs = read('components/TypeTabs.tsx');
    expect(tabs).not.toContain('#leeskamer-soorten-kop');
    expect(tabs).not.toContain('compact');
    expect(read('app/(app)/wiki/page.tsx')).not.toMatch(/^\s*compact\s*$/m);
  });

  it('laat Aanmaken alleen in het huisraadblad plakken', () => {
    const sheet = read('components/ui/NewEntrySheet.tsx');
    expect(sheet).toContain("chosen?.shopFields ? 'sheet-actions-stick' : undefined");
  });

  it('laadt de drie letters voor, met een systeemletter op maat erachter', () => {
    const fonts = read('app/fonts.ts');
    expect(fonts).toContain("from 'next/font/local'");
    for (const file of ['source-sans-3-latin-400', 'source-serif-4-latin-400', 'archivo-narrow-latin-500']) {
      expect(fonts).toContain(file);
    }
    expect(read('app/layout.tsx')).toContain('className={fontVariables}');
    const css = read('app/globals.css');
    expect(css).toContain("--sans: var(--font-bron-sans, 'Source Sans 3'), 'Source Sans 3', 'Source Sans 3 Fallback'");
    expect(css).toContain("--serif: var(--font-bron-serif, 'Source Serif 4'), 'Source Serif 4', 'Source Serif 4 Fallback'");
    expect(css).toContain("--stamp-face: var(--font-stempel, 'Archivo Narrow'), 'Archivo Narrow', 'Archivo Narrow Fallback'");
    for (const face of ['Source Sans 3', 'Source Serif 4', 'Archivo Narrow']) {
      expect(css).toContain(`font-family: '${face} Fallback'`);
    }
  });
});

describe('golf K (M3): een uitwijkende naam blijft op het glas', () => {
  it('wijkt niet naar rechts uit als hij daar over de rand van het glas valt', () => {
    // Twee spelden vlak bij de rechterrand; de voorste houdt "onder".
    const pins = [
      { id: 'achter', x: 360, y: 200, width: 100 },
      { id: 'voor', x: 330, y: 200, width: 100 },
    ];
    const places = placeLabels(pins, { width: 390, height: 600 });
    expect(places.get('voor')!.spot).toBe('onder');
    expect(places.get('achter')!.spot).not.toBe('rechts');
  });
});
