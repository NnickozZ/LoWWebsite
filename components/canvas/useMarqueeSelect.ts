'use client';

import { useCallback, useRef, useState } from 'react';
import {
  hitsIn,
  pressSelection,
  toggleSelection,
  type Box,
  type Rect,
} from '@/lib/canvas/select';

/**
 * §67 — de sleep-selectie, één keer geschreven.
 *
 * The gesture the prikbord invented and every canvas after it copies:
 *
 * - **shift-click** on a thing toggles it in or out of the selection;
 * - a **plain click** on something not chosen chooses only it, and a plain
 *   press on something that *is* chosen leaves the whole group standing — you
 *   are about to drag it (`pressSelection`, and the reason it exists);
 * - **shift-drag on bare paper** sweeps a box, and everything the box *touches*
 *   is selected when it closes;
 * - a **plain drag on bare paper** is the surface's own business — a pan, on
 *   every canvas we have.
 *
 * The arithmetic is in `lib/canvas/select.ts` and is tested there without a
 * browser. This hook is only the React around it: two pieces of state (what is
 * chosen, and the box while it is open) and three handlers to hang off the
 * stage.
 *
 * **What this hook does not own, on purpose.** Each surface keeps these,
 * because each one answers them differently and a shared version would be a
 * pile of options rather than a shared thing:
 *
 * - **undo** — what a deletion or a group drag pushes on the stack, and what a
 *   Ctrl+Z restores (`components/canvas/undoStack.ts`);
 * - **dirty ids** — which ids a save is allowed to assert (§61);
 * - **holding and presence** — telling everybody else what this hand has
 *   chosen (`setHolding`, the `.board-held` / `.tree-held` outlines) and
 *   drawing the boxes other people are sweeping. The hook offers `onBroadcast`
 *   for the box itself and nothing more;
 * - **the inspector** — what a selection of one, of six, or of none puts on the
 *   screen;
 * - **what else a press means** — a string's grip, a resize handle, a pan, the
 *   list of things a press on the stage must ignore.
 */

/** Everything the hook needs to know about a pointer event, and nothing more. */
type PointerLike = { clientX: number; clientY: number };

export type MarqueeSelect = {
  /** The ids chosen right now. */
  selected: Set<string>;
  /** For the surface's own reasons: a card someone else deleted, a fresh card to select. */
  setSelected: (next: Set<string> | ((current: Set<string>) => Set<string>)) => void;
  /** A press on a thing. `additive` is Shift; see `pressSelection`. */
  select: (id: string, additive: boolean, alreadySelected?: boolean) => void;
  /**
   * §69: that press has ended. Pass whether it travelled far enough to be a
   * drag. Only a shift-press on something already chosen is waiting on this;
   * for every other press it costs nothing and may be called anyway.
   */
  endPress: (travelled: boolean) => void;
  /** Nothing chosen. Cheap when nothing was chosen already. */
  clear: () => void;
  /** The box being swept, in world coordinates, or null. */
  marquee: Rect | null;
  /** Start sweeping. Answers false — and does nothing — when the hook is not enabled. */
  beginMarquee: (event: PointerLike) => boolean;
  /** Answers true when it handled the move, so the surface can stop. */
  onPointerMove: (event: PointerLike) => boolean;
  /** Answers true when it closed a box, so the surface can stop. */
  onPointerUp: (event: PointerLike) => boolean;
  /** A box is open: a hand is on this canvas and a pull should wait (§8, §61). */
  busy: boolean;
};

/**
 * `items` may be an array or a function that answers one. A canvas that keeps
 * its things in a ref beside its state — the prikbord does, §61 — hands over
 * the function, so the hit test at the end of a sweep measures the paper as it
 * is at that instant rather than as it was when the render that opened the box
 * ran.
 */
type ItemsSource<T> = readonly T[] | (() => readonly T[]);

export function useMarqueeSelect<T extends { id: string }>(options: {
  items: ItemsSource<T>;
  /** The thing's box in world coordinates, or null to leave it out of the sweep. */
  boxOf: (item: T) => Box | null;
  /** A screen point in world coordinates — the surface's own pan and zoom. */
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** False on a phone, on a read-only canvas: no box may be opened. */
  enabled: boolean;
  /** What a closed box does to what was already chosen. */
  mode: 'replace' | 'union';
  /**
   * The box as it travels, in world coordinates, and `null` when it closes.
   * §8, live: a box dragged round half the wall is something you are doing *to*
   * a canvas somebody else is working on, so they should see it happen.
   */
  onBroadcast?: (rect: [number, number, number, number] | null) => void;
}): MarqueeSelect {
  const { enabled, mode } = options;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<Rect | null>(null);

  /*
   * The four things a pointer handler needs are read through refs, written on
   * every render. The handlers themselves are then stable for the life of the
   * canvas, which matters: they are hung off the stage and off `pointerup` on
   * the window, and a fresh identity every frame would re-bind both mid-drag.
   */
  const itemsRef = useRef<ItemsSource<T>>(options.items);
  itemsRef.current = options.items;
  const boxOfRef = useRef(options.boxOf);
  boxOfRef.current = options.boxOf;
  const toWorldRef = useRef(options.toWorld);
  toWorldRef.current = options.toWorld;
  const broadcastRef = useRef(options.onBroadcast);
  broadcastRef.current = options.onBroadcast;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** The open box, as a ref too: `onPointerUp` must not read a stale render. */
  const openRef = useRef<Rect | null>(null);

  /**
   * §69: a shift-press on something *already* chosen, held back until the
   * press is over.
   *
   * Measured on both canvases that answer shift at all: choose A, shift-click
   * B, then shift-press B and drag. Both cards travelled — which is right,
   * that is a group being grabbed by one of its members — and B came out of
   * the selection on the way down, so the hand let go of a group of two with
   * one of them outlined and the other not. The toggle is the *end* of a
   * press that did not travel; a press that travels is a drag and must leave
   * the selection alone.
   */
  const pendingToggle = useRef<string | null>(null);

  const select = useCallback((id: string, additive: boolean, alreadySelected?: boolean) => {
    setSelected((current) => {
      const chosen = alreadySelected ?? current.has(id);
      if (additive && chosen) {
        // Not yet: this may be the first millimetre of a group drag.
        pendingToggle.current = id;
        return current;
      }
      pendingToggle.current = null;
      // `pressSelection` gives back the very Set it was handed when the press
      // changes nothing — a plain press on a card that is already chosen.
      return pressSelection(current, id, additive, chosen);
    });
  }, []);

  /**
   * The press that `select` held back is over. `travelled` is the surface's own
   * answer to "was this a drag" — each one measures it against `DRAG_SLOP` in
   * its own coordinates, and only the surface knows.
   */
  const endPress = useCallback((travelled: boolean) => {
    const id = pendingToggle.current;
    pendingToggle.current = null;
    if (!id || travelled) return;
    setSelected((current) => toggleSelection(current, id, true));
  }, []);

  const clear = useCallback(() => {
    setSelected((current) => (current.size ? new Set() : current));
  }, []);

  const beginMarquee = useCallback((event: PointerLike) => {
    if (!enabledRef.current) return false;
    const point = toWorldRef.current(event.clientX, event.clientY);
    const rect: Rect = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
    openRef.current = rect;
    setMarquee(rect);
    return true;
  }, []);

  const onPointerMove = useCallback((event: PointerLike) => {
    const open = openRef.current;
    if (!open) return false;
    const point = toWorldRef.current(event.clientX, event.clientY);
    const rect: Rect = { ...open, x1: point.x, y1: point.y };
    openRef.current = rect;
    setMarquee(rect);
    broadcastRef.current?.([
      Math.round(rect.x0),
      Math.round(rect.y0),
      Math.round(rect.x1),
      Math.round(rect.y1),
    ]);
    return true;
  }, []);

  const onPointerUp = useCallback((_event: PointerLike) => {
    const open = openRef.current;
    if (!open) return false;
    const source = itemsRef.current;
    const items = typeof source === 'function' ? source() : source;
    const hit = hitsIn(open, items, boxOfRef.current).map((item) => item.id);
    setSelected((current) =>
      modeRef.current === 'union' ? new Set([...current, ...hit]) : new Set(hit),
    );
    openRef.current = null;
    setMarquee(null);
    // The box is closed; take it off everyone else's canvas. What it chose
    // shows up as the coloured outlines presence already draws.
    broadcastRef.current?.(null);
    return true;
  }, []);

  return {
    selected,
    setSelected,
    select,
    endPress,
    clear,
    marquee,
    beginMarquee,
    onPointerMove,
    onPointerUp,
    busy: marquee !== null,
  };
}
