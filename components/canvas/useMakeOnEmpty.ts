'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * §69 — bare paper makes the thing this surface is for.
 *
 * Two of the four canvases had this and two did not: a double-click on the
 * prikbord's wall made nothing, a double-click on a landkaart made nothing, and
 * the tijdlijn had both a double-click *and* a long press for a phone, written
 * out in its own file. Nick's answer (round 35) was that all four should make
 * something, so this is the gesture, once.
 *
 * ## Why it is one hook and not four handlers
 *
 * The double-click itself is trivial; the two things round it are not.
 *
 *  - **A phone has no double-click.** The tijdlijn already knew that and grew a
 *    half-second long press with a travel fence, and every canvas needs the
 *    same one — written a second time it would be the same three bugs again
 *    (fires during a pinch, fires after a pan, fires with the potlood out).
 *  - **What counts as bare paper differs per surface and nothing else does.**
 *    That is the `ignore` selector, and it is the only argument that changes:
 *    the tijdlijn skips its tags and windows, the wall its cards and draadjes,
 *    the stamboom its kaartjes and handgrepen. Every one of them skips
 *    `.ink-capture` and `.ink-toolbar`, because §33 says two quick dots with
 *    the potlood are two dots.
 *
 * ## What it deliberately does not do
 *
 * It does not ask whether a *drag* is in progress — the surface knows that and
 * hands it over as `busy`. It does not read the pointer capture, place anything,
 * or touch the camera: it answers "a hand asked for something here" with a
 * point in client coordinates, and the canvas turns that into a moment, a
 * fraction of a picture, or a spot on the glass in its own way.
 */

/** Half a second, the tijdlijn's number since §62 — long enough not to fire on a tap. */
export const LONG_PRESS_MS = 500;
/** How far a finger may wander and still be a press rather than a pan. */
export const LONG_PRESS_SLOP = 8;

/**
 * The two decisions this hook makes, pulled out so they can be asked without a
 * browser.
 *
 * Playwright's `touchscreen` can tap and it can drag; it cannot press and
 * hold, which is why §62's long press on the tijdlijn went four rounds with no
 * e2e covering it at all. `tests/e2e/canvas-contract.spec.ts` asserts the
 * *wiring* — that a canvas hung this hook on its stage — through the
 * double-click, and the timer's own rules are held down here instead.
 */

/** Anything with `closest`: a real element, or a stub in a test. */
type Closest = { closest: (selector: string) => unknown };

/**
 * Is this press on bare paper? `.ink-capture` and `.ink-toolbar` are always
 * out — §33's two quick dots with the potlood are two dots — and each surface
 * adds what else is not paper.
 */
export function isBarePaper(target: Closest | null | undefined, ignore: string): boolean {
  if (!target?.closest) return true;
  return !target.closest(`${ignore}, .ink-capture, .ink-toolbar`);
}

/** Has the finger wandered far enough that this is a pan rather than a press? */
export function pressWandered(
  from: { x: number; y: number },
  to: { x: number; y: number },
  slop = LONG_PRESS_SLOP,
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > slop;
}

export type MakeOnEmpty = {
  /** Hang on the stage's `onDoubleClick`. */
  onDoubleClick: (event: { clientX: number; clientY: number; target: EventTarget | null }) => void;
  /** Hang on the stage's `onPointerDown`, after whatever else it does. */
  onPointerDown: (event: {
    clientX: number;
    clientY: number;
    pointerType: string;
    target: EventTarget | null;
  }) => void;
  /** Hang on `onPointerMove`: a finger that travels is panning, not asking. */
  onPointerMove: (event: { clientX: number; clientY: number }) => void;
  /** Hang on `onPointerUp` and `onPointerCancel`. */
  cancel: () => void;
};

export function useMakeOnEmpty(options: {
  /** False while read-only, while the potlood is out, before the view exists. */
  enabled: boolean;
  /**
   * A CSS selector for everything that is *not* bare paper. `.ink-capture` and
   * `.ink-toolbar` are added for you — every canvas needs them and forgetting
   * one is §33's bug.
   */
  ignore: string;
  /** A hand asked for something at this point, in client coordinates. */
  onMake: (point: { clientX: number; clientY: number }) => void;
  /**
   * True while the surface is in the middle of a gesture it owns — a pan, a
   * pinch, a card being dragged. Read at the moment the timer fires, not when
   * it was set, so a press that *became* a pan is dropped.
   */
  busy?: () => boolean;
}): MakeOnEmpty {
  const latest = useRef(options);
  latest.current = options;

  const timer = useRef<{ id: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current.id);
    timer.current = null;
  }, []);

  // A press that outlives the canvas takes its timer with it.
  useEffect(() => cancel, [cancel]);

  const onBarePaper = useCallback(
    (target: EventTarget | null): boolean =>
      isBarePaper(target as HTMLElement | null, latest.current.ignore),
    [],
  );

  const onDoubleClick = useCallback(
    (event: { clientX: number; clientY: number; target: EventTarget | null }) => {
      const { enabled, onMake } = latest.current;
      if (!enabled || !onBarePaper(event.target)) return;
      onMake({ clientX: event.clientX, clientY: event.clientY });
    },
    [onBarePaper],
  );

  const onPointerDown = useCallback(
    (event: { clientX: number; clientY: number; pointerType: string; target: EventTarget | null }) => {
      cancel();
      const { enabled } = latest.current;
      // A mouse has a double-click; only a finger needs the slow road.
      if (!enabled || event.pointerType === 'mouse' || !onBarePaper(event.target)) return;
      const { clientX, clientY } = event;
      const id = setTimeout(() => {
        timer.current = null;
        // Asked *now*, not when the press began: by this point it may have
        // turned into a pan or picked up a second finger.
        if (latest.current.busy?.()) return;
        latest.current.onMake({ clientX, clientY });
      }, LONG_PRESS_MS);
      timer.current = { id, x: clientX, y: clientY };
    },
    [cancel, onBarePaper],
  );

  const onPointerMove = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const open = timer.current;
      if (!open) return;
      if (pressWandered({ x: open.x, y: open.y }, { x: event.clientX, y: event.clientY })) cancel();
    },
    [cancel],
  );

  return { onDoubleClick, onPointerDown, onPointerMove, cancel };
}
