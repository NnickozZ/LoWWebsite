'use client';

import { useEffect, type RefObject } from 'react';

/** What counts as "the one you are on" in a row: a tab, a radio chip, an outline link. */
const ACTIEF =
  '[aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-checked="true"], .entry-outline-current';

/** Room left beside the item, so it does not stand under the faded edge (`.schuifrij`, 2rem). */
const MARGE = 36;

/**
 * §104 (golf H, T9): the chosen item of a `.schuifrij` is on screen.
 *
 * A row of tabs or chips that scrolls sideways shows its start; on a phone the
 * tab you are on — *Locaties*, the fifth shelf of a dossier, *Geschiedenis* in
 * the outline — was then off the right edge, and nothing said where you were.
 * This puts it in view, without moving the page (never `scrollIntoView`, which
 * scrolls every ancestor) and without animating (a jump the reader did not
 * make should not travel, §102).
 *
 * `key` is whatever changes when the chosen item does; the effect runs again.
 */
export function useSchuifrij(ref: RefObject<HTMLElement | null>, key?: unknown): void {
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    schuifInBeeld(row);
  }, [ref, key]);
}

/** Scroll `row` so its chosen item is inside it, clear of the faded edges. Pure DOM, no layout on a row that fits. */
export function schuifInBeeld(row: HTMLElement): void {
  if (row.scrollWidth <= row.clientWidth + 1) return;
  const actief = row.querySelector<HTMLElement>(ACTIEF);
  if (!actief) return;
  const rij = row.getBoundingClientRect();
  const ding = actief.getBoundingClientRect();
  if (ding.left < rij.left + MARGE) {
    row.scrollLeft += ding.left - rij.left - MARGE;
  } else if (ding.right > rij.right - MARGE) {
    row.scrollLeft += ding.right - rij.right + MARGE;
  }
}
