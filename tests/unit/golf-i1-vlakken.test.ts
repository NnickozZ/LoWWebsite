import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PEEK_DRAG_THRESHOLD,
  PEEK_FLICK_SPEED,
  PEEK_SLOP,
  peekDragOffset,
  peekRelease,
} from '@/lib/canvas/peek';
import { DEFAULT_WORDS, fill, WORD_GROUPS } from '@/lib/words';

/**
 * §105 (golf i1) — de tekenvlakken op de telefoon.
 *
 * De greep van de peek is een rekensom (`lib/canvas/peek.ts`), en de rest is
 * een afspraak tussen vijf canvasbestanden en één stylesheet. Wat hier staat is
 * de rekensom, plus de afspraken die je met lezen kunt controleren: dat de laag
 * geladen wordt, dat elke maakknop dezelfde klasse draagt, en dat de lege
 * staat één zin en één werkwoord is.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('§105 de greep van de peek', () => {
  it('omhoog vanuit klein is groot, omlaag vanuit klein is weg', () => {
    expect(peekRelease('peek', -PEEK_DRAG_THRESHOLD - 1)).toBe('grow');
    expect(peekRelease('peek', PEEK_DRAG_THRESHOLD + 1)).toBe('close');
  });

  it('omlaag vanuit groot is klein, en omhoog vanuit groot doet niets', () => {
    expect(peekRelease('full', PEEK_DRAG_THRESHOLD + 1)).toBe('shrink');
    expect(peekRelease('full', -200)).toBe('stay');
  });

  it('een aarzeling is geen besluit', () => {
    expect(peekRelease('peek', 20)).toBe('stay');
    expect(peekRelease('peek', -20)).toBe('stay');
    expect(peekRelease('full', 20)).toBe('stay');
  });

  it('een korte zwiep telt als een lange veeg', () => {
    expect(peekRelease('peek', 20, PEEK_FLICK_SPEED + 0.1)).toBe('close');
    expect(peekRelease('peek', -20, -(PEEK_FLICK_SPEED + 0.1))).toBe('grow');
    expect(peekRelease('full', 20, PEEK_FLICK_SPEED + 0.1)).toBe('shrink');
  });

  it('een trilling onder de sleepdrempel is nooit een zwiep', () => {
    expect(peekRelease('peek', PEEK_SLOP - 1, 5)).toBe('stay');
  });

  it('omlaag volgt de peek de duim helemaal', () => {
    expect(peekDragOffset(120, 0)).toBe(120);
    expect(peekDragOffset(0, 300)).toBe(0);
  });

  it('omhoog volgt hij tot de ruimte er is, en rekt daarna een vijfde, hoogstens 24 px', () => {
    expect(peekDragOffset(-100, 300)).toBe(-100);
    expect(peekDragOffset(-350, 300)).toBe(-310);
    expect(peekDragOffset(-2000, 300)).toBe(-324);
    // Al groot: meteen de rubberrand.
    expect(peekDragOffset(-50, 0)).toBe(-10);
  });
});

describe('§105 de laag en de knoppen', () => {
  it('app/vlakken.css wordt geladen, na leeskamer.css', () => {
    const layout = read('app/layout.tsx');
    const a = layout.indexOf("import './leeskamer.css'");
    const b = layout.indexOf("import './vlakken.css'");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
  });

  it('elk vlak geeft zijn eerste maakknop de klasse canvas-make', () => {
    for (const file of [
      'components/boards/BoardCanvas.tsx',
      'components/maps/MapCanvas.tsx',
      'components/timelines/TimelineCanvas.tsx',
      'components/families/FamilyTreeCanvas.tsx',
    ]) {
      expect(read(file), file).toMatch(/className="[^"]*\bcanvas-make\b/);
    }
  });

  it('de ongedaan-knop en de zoombalk dragen hun haak voor de telefoon', () => {
    expect(read('components/canvas/CanvasUndoButton.tsx')).toContain('canvas-undo');
    expect(read('components/canvas/CanvasZoomControls.tsx')).toContain('is-woorden');
  });

  it('de peek beweegt niet meer op max-height (§102 regel 3)', () => {
    const css = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const peek = css.slice(css.indexOf('.canvas-peek {'), css.indexOf('}', css.indexOf('.canvas-peek {')));
    expect(peek).not.toMatch(/transition\s*:/);
    const vlakken = read('app/vlakken.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of vlakken.matchAll(/transition\s*:([^;]*);/g)) {
      expect(m[1], m[0]).not.toMatch(/max-height|height|top|bottom/);
    }
  });

  it('elke nieuwe beweging heeft een tak voor reduced motion', () => {
    const vlakken = read('app/vlakken.css');
    expect(vlakken).toContain('@media (prefers-reduced-motion: reduce)');
    expect(vlakken).toMatch(/vlak-peek-verschijnt var\(--dur-3\)/);
  });
});

describe('§105 de lege staat: één zin, één werkwoord', () => {
  const group = WORD_GROUPS.find((g) => g.title === 'De tekenvlakken (golf i1)');

  it('heeft een eigen groep, direct onder de markering van golf i1', () => {
    expect(group).toBeDefined();
    const src = read('lib/words.ts');
    expect(src.indexOf("title: 'De tekenvlakken (golf i1)'")).toBeGreaterThan(src.indexOf('// ── golf i1'));
    expect(src.indexOf("title: 'De tekenvlakken (golf i1)'")).toBeLessThan(src.indexOf('// ── golf i2'));
  });

  it('elke zin is één zin, zonder uitroepteken', () => {
    for (const key of ['vlakLeegPrikbord', 'vlakLeegLandkaart', 'vlakLeegTijdlijn', 'vlakLeegStamboom']) {
      const zin = DEFAULT_WORDS[key];
      expect(zin, key).toMatch(/\.$/);
      expect(zin.slice(0, -1), key).not.toMatch(/[.!?]/);
      expect(zin, key).not.toContain('!');
    }
  });

  it('elke knop is kort en noemt geen gebaar', () => {
    for (const key of ['vlakLeegPrikbordDoe', 'vlakLeegLandkaartDoe', 'vlakLeegTijdlijnDoe', 'vlakLeegStamboomDoe', 'vlakLeegBegin']) {
      const knop = DEFAULT_WORDS[key];
      expect(knop.split(/\s+/).length, key).toBeLessThanOrEqual(3);
      expect(knop, key).not.toMatch(/dubbel|klik|houd|sleep|Bewerken/i);
      // §64: never the name of the bar's own maker, or a spec finds two.
      expect(knop, key).not.toMatch(/speld zetten|gebeurtenis toevoegen|nieuwe notitie|los kaartje/i);
    }
  });

  it('de accolades worden gevuld met de woorden van dit archief', () => {
    expect(fill(DEFAULT_WORDS.vlakLeegStamboom, { stamboom: DEFAULT_WORDS.familyTree })).toBe('Nog niemand in deze stamboom.');
    expect(fill(DEFAULT_WORDS.vlakLeegLandkaartDoe, { speld: DEFAULT_WORDS.mapPin })).toBe('Zet een speld');
  });
});

describe('§105 na review 4', () => {
  it('M2: alles in beeld op een tijdlijn laat de tags aan de uiteinden op het glas', async () => {
    const { fitView } = await import('@/lib/timelines/time');
    const moments = [0, 86_400 * 30];
    const width = 374;
    const plain = fitView(moments, width, 'day', undefined, 0);
    const edged = fitView(moments, width, 'day', undefined, 85);
    // More air: the span takes fewer pixels, so each end is further from the rim.
    expect(edged.pxPerSecond).toBeLessThan(plain.pxPerSecond);
    const firstX = (moments[0] - edged.origin) * edged.pxPerSecond;
    const lastX = (moments[1] - edged.origin) * edged.pxPerSecond;
    expect(firstX).toBeGreaterThanOrEqual(85);
    expect(width - lastX).toBeGreaterThanOrEqual(85);
  });

  it('H4: Tekenen heeft een eigen teken, niet het potlood van Bewerken', () => {
    const tools = read('components/ink/InkTools.tsx');
    expect(tools).toMatch(/data-testid="ink-pen"[\s\S]{0,200}<Icon name="krabbel"/);
    expect(read('components/Icon.tsx')).toMatch(/\bkrabbel: '/);
  });

  it('L11: in Bewerken is de knop op een leeg vlak geen tweede rode knop', () => {
    const empty = read('components/canvas/CanvasEmpty.tsx');
    expect(empty).toContain("action.primary ? ' btn-primary' : ''");
    for (const file of [
      'components/boards/BoardCanvas.tsx',
      'components/maps/MapCanvas.tsx',
      'components/timelines/TimelineCanvas.tsx',
      'components/families/FamilyTreeCanvas.tsx',
    ]) {
      // Only the Lezen verb (*Beginnen*) is primary.
      expect((read(file).match(/primary: true/g) ?? []).length, file).toBe(1);
    }
  });

  it('H3: een lege landkaart en tijdlijn zijn een strook, geen fiche over de kaart', () => {
    expect(read('components/maps/MapCanvas.tsx')).toMatch(/className="map-empty"\s+strook/);
    expect(read('components/timelines/TimelineCanvas.tsx')).toMatch(/className="timeline-empty"\s+strook/);
  });
});
