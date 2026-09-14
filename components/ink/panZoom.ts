'use client';

import { useCallback, useRef, type RefObject } from 'react';

/**
 * §33/§67: the one pan-and-zoom space.
 *
 * Three of the four places a tekenlaag hangs — a prikbord, a landkaart and a
 * stamboom — put their world under one translate and one scale, so the two
 * sums a tekenlaag needs are the same sums in all three: a content point onto
 * the glass (`project`), and a point of the screen back into the content
 * (`toContent`). A tijdlijn is the exception and keeps its own pair, because
 * its x is a *moment* (`lib/timelines/inkSpace.ts`).
 *
 * The border is the part that was wrong in all three copies. A stage is
 * `position: relative` **with a 1 px border**, and an absolutely placed child
 * — the world, the tekenlaag — is laid out against its *padding* box, while
 * `getBoundingClientRect()` gives the *border* box. Subtracting only
 * `rect.left` therefore put every stroke one pixel up and to the left of the
 * hand that drew it. `clientLeft`/`clientTop` are exactly that border, so they
 * come off too. (`useElementSize` reads `clientWidth`/`clientHeight` for the
 * same reason — the canvas is the padding box, not the border box.)
 */

/** A view that is one translate and one scale. */
export type PanZoom = { x: number; y: number; zoom: number };

/** Where a stage's *padding* box starts, in client pixels. */
export type StageBox = { left: number; top: number; borderLeft: number; borderTop: number };

const NO_STAGE: StageBox = { left: 0, top: 0, borderLeft: 0, borderTop: 0 };

/** The stage as it stands right now. A stage that is not there is the origin. */
export function stageBoxOf(el: HTMLElement | null | undefined): StageBox {
  if (!el) return NO_STAGE;
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, borderLeft: el.clientLeft, borderTop: el.clientTop };
}

/** A content point, in pixels on the glass. */
export function projectPanZoom(view: PanZoom, x: number, y: number): { x: number; y: number } {
  return { x: view.x + x * view.zoom, y: view.y + y * view.zoom };
}

/** A point of the screen, in the content's own units. */
export function contentPanZoom(
  view: PanZoom,
  box: StageBox,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: (clientX - box.left - box.borderLeft - view.x) / view.zoom,
    y: (clientY - box.top - box.borderTop - view.y) / view.zoom,
  };
}

/**
 * The pair, wired to a stage and a view.
 *
 * `project` follows the view as it changes (the tekenlaag is repainted when it
 * does); `toContent` reads the view of the moment off a ref, because the hand
 * that is drawing must not be following a view from a render ago.
 */
export function usePanZoomInk(
  stageRef: RefObject<HTMLElement | null>,
  view: PanZoom,
): { project: (x: number, y: number) => { x: number; y: number }; toContent: (clientX: number, clientY: number) => { x: number; y: number } } {
  const viewRef = useRef(view);
  viewRef.current = view;
  const project = useCallback((x: number, y: number) => projectPanZoom(view, x, y), [view]);
  const toContent = useCallback(
    (clientX: number, clientY: number) =>
      contentPanZoom(viewRef.current, stageBoxOf(stageRef.current), clientX, clientY),
    [stageRef],
  );
  return { project, toContent };
}
