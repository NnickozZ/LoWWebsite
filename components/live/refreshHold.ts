'use client';

import { useEffect, useId } from 'react';

/**
 * §59: "nothing lands while a hand is on the page".
 *
 * A canvas (prikbord, tijdlijn, landkaart) or a sheet that is mid-gesture —
 * a drag, an open sheet with half-typed fields, an ink stroke, an upload —
 * takes a *hold*. While any hold is taken, `LivePage` remembers that a
 * watched key moved but does not `router.refresh()`; the moment the last
 * hold is released, one refresh fires. A hold never drops a signal, it only
 * delays it — the same rule `useBoardLive` has had for its pulls since §8.
 *
 * Module-level on purpose: the holder is a child of the page and `LivePage`
 * is a sibling rendered by the server page, so a context would not reach.
 * One tab, one registry.
 */

const holders = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must not break the others */
    }
  }
}

/** True while anything on this page asks the refresh to wait. */
export function isRefreshHeld(): boolean {
  return holders.size > 0;
}

/** Called when the last hold is released (and on any change). Returns unsubscribe. */
export function onRefreshHoldChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Imperative form, for code outside React (rare). */
export function takeRefreshHold(id: string) {
  const before = holders.size;
  holders.add(id);
  if (before === 0) notify();
}

export function releaseRefreshHold(id: string) {
  if (!holders.delete(id)) return;
  if (holders.size === 0) notify();
}

/** Test seam. */
export function _resetRefreshHolds() {
  holders.clear();
  listeners.clear();
}

/**
 * `useHoldRefresh(busy)` — while `busy` is true this component holds the
 * page's live refresh. Released on unmount. Cheap to call every render.
 */
export function useHoldRefresh(busy: boolean) {
  const id = useId();
  useEffect(() => {
    if (!busy) return;
    takeRefreshHold(id);
    return () => releaseRefreshHold(id);
  }, [busy, id]);
}
