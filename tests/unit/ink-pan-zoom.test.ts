import { describe, expect, it } from 'vitest';
import { contentPanZoom, projectPanZoom, type PanZoom, type StageBox } from '@/components/ink/panZoom';

/**
 * §33/§67: the one pan-and-zoom space a prikbord, a landkaart and a stamboom
 * all draw in. The sums are pure and live in `components/ink/panZoom.ts`, so
 * they can be checked without a browser round the tekenlaag.
 *
 * The border is the point of half of these. A stage is `position: relative`
 * with a 1 px border; an absolutely placed child — the world, the tekenlaag —
 * is laid out against the *padding* box, while `getBoundingClientRect()` gives
 * the *border* box. Three canvases subtracted only `rect.left`, and every
 * stroke landed a pixel up and to the left of the hand that drew it.
 */

const view: PanZoom = { x: 40, y: -25, zoom: 2 };
/** A stage 100 px in from the left, 60 down, with a 1 px border like the real ones. */
const stage: StageBox = { left: 100, top: 60, borderLeft: 1, borderTop: 1 };
const noBorder: StageBox = { left: 100, top: 60, borderLeft: 0, borderTop: 0 };

describe('projectPanZoom', () => {
  it('puts the origin of the content where the view says it is', () => {
    expect(projectPanZoom(view, 0, 0)).toEqual({ x: 40, y: -25 });
  });

  it('scales by the zoom, not by anything else', () => {
    expect(projectPanZoom(view, 10, 10)).toEqual({ x: 60, y: -5 });
    expect(projectPanZoom({ x: 0, y: 0, zoom: 0.5 }, 10, 10)).toEqual({ x: 5, y: 5 });
  });
});

describe('contentPanZoom', () => {
  it('takes the stage, the border and the view off, in that order', () => {
    // x: 100 (stage) + 1 (border) + 40 (pan) + 2 × 7 (zoomed content) = 155.
    // y: 60 (stage) + 1 (border) − 25 (pan) + 2 × 0 = 36.
    expect(contentPanZoom(view, stage, 155, 36)).toEqual({ x: 7, y: 0 });
  });

  it('is exactly one pixel off per border when the border is forgotten', () => {
    const withBorder = contentPanZoom(view, stage, 300, 300);
    const without = contentPanZoom(view, noBorder, 300, 300);
    // A pixel of border is half a unit of content at 2×, and it is a pixel the
    // hand is *further* into the content than the old sum believed.
    expect(without.x - withBorder.x).toBeCloseTo(1 / view.zoom, 10);
    expect(without.y - withBorder.y).toBeCloseTo(1 / view.zoom, 10);
  });

  it('is the other way round from projectPanZoom, border and all', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 12.5, y: -300 },
      { x: -87, y: 41.25 },
    ]) {
      const on = projectPanZoom(view, point.x, point.y);
      const back = contentPanZoom(view, stage, on.x + stage.left + stage.borderLeft, on.y + stage.top + stage.borderTop);
      expect(back.x).toBeCloseTo(point.x, 10);
      expect(back.y).toBeCloseTo(point.y, 10);
    }
  });

  it('is the sum the four canvases used to write out one each', () => {
    // A prikbord's `toBoard`, a landkaart's `inkToContent`, a stamboom's
    // `toWorld` — the same three lines with different names on them.
    const clientX = 512;
    const clientY = 331;
    expect(contentPanZoom(view, stage, clientX, clientY)).toEqual({
      x: (clientX - stage.left - stage.borderLeft - view.x) / view.zoom,
      y: (clientY - stage.top - stage.borderTop - view.y) / view.zoom,
    });
  });
});
