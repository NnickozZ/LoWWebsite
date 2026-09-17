'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { PinchTracker } from '@/lib/canvas/pinch';
import { clampZoom, type CanvasView } from '@/lib/canvas/view';

/**
 * §72 — the knijp, as React.
 *
 * `lib/canvas/pinch.ts` is the arithmetic; this is the wiring, and it is the
 * same wiring on every canvas that uses it, so the three rules in that file
 * hold on each of them without being remembered three times:
 *
 * - **Only fingers.** A mouse or a pen is never part of a knijp.
 * - **Capture phase.** The canvas puts these on its stage as
 *   `onPointerDownCapture` / `onPointerMoveCapture` / `onPointerUpCapture`, so
 *   the stage hears a second finger *before* a card or a speld under it can
 *   start a drag of its own. When a handler answers `true` the event belongs
 *   to the knijp and the canvas stops it there.
 * - **The window has the last word on a finger leaving.** A `pointerup` that a
 *   child swallowed, or that was aimed at an element that unmounted mid-knijp
 *   (a speld folding into a kluitje, §71), still reaches `window` in the capture
 *   phase — so the tracker can never keep a ghost finger.
 *
 * `read` answers the view *now* (a ref, never render state: a knijp re-bases
 * between two renders), `write` sets it. `onStart` is the canvas's chance to
 * drop whatever the first finger had begun — a pan, a drag, a long press — and
 * `onEnd` to save the camera.
 */
export function usePinch(options: {
  stageRef: RefObject<HTMLElement | null>;
  read: () => CanvasView;
  write: (view: CanvasView) => void;
  clamp?: (zoom: number) => number;
  onStart?: () => void;
  onEnd?: () => void;
  enabled?: boolean;
}) {
  const opts = useRef(options);
  opts.current = options;
  const tracker = useRef<PinchTracker | null>(null);
  if (!tracker.current) tracker.current = new PinchTracker((zoom) => (opts.current.clamp ?? clampZoom)(zoom));

  const local = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = opts.current.stageRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const lift = useCallback((pointerId: number) => {
    const t = tracker.current!;
    if (!t.has(pointerId)) return false;
    const ended = t.up(pointerId, opts.current.read());
    if (ended) opts.current.onEnd?.();
    return ended;
  }, []);

  /** True when this finger made (or joined) a knijp: the canvas should stop the event. */
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch' || opts.current.enabled === false) return false;
      const t = tracker.current!;
      const began = t.down(event.pointerId, local(event), opts.current.read());
      if (began) opts.current.onStart?.();
      return t.active;
    },
    [local],
  );

  /** True when this move was part of the knijp (and the view has been written). */
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') return false;
      const t = tracker.current!;
      if (!t.active || !t.has(event.pointerId)) return false;
      const next = t.move(event.pointerId, local(event));
      if (next) opts.current.write(next);
      return true;
    },
    [local],
  );

  /**
   * True when this finger was part of a knijp. Its partner, if still down, is
   * *not* handed back to a pan: after a knijp a lone finger stays still until
   * it is lifted, which is what every photo app does and what makes the last
   * finger off the glass unable to fling the picture.
   */
  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') return false;
      const t = tracker.current!;
      if (!t.has(event.pointerId)) return false;
      const was = t.active;
      lift(event.pointerId);
      return was;
    },
    [lift],
  );

  useEffect(() => {
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === 'touch') lift(event.pointerId);
    };
    window.addEventListener('pointerup', onLeave, true);
    window.addEventListener('pointercancel', onLeave, true);
    return () => {
      window.removeEventListener('pointerup', onLeave, true);
      window.removeEventListener('pointercancel', onLeave, true);
    };
  }, [lift]);

  /** Is a knijp going on right now? For a `busy` or a long-press guard. */
  const active = useCallback(() => tracker.current!.active, []);
  /** How many fingers are down on this stage. */
  const fingers = useCallback(() => tracker.current!.size, []);

  return { onPointerDown, onPointerMove, onPointerUp, active, fingers };
}
