'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { nextIndex, rowForEnter, suggestKey } from '@/lib/search/suggestKeys';

/** The class every suggestion row in this archive already wears. */
const ROW = '.suggest-item';
/** What marks the row the arrows are standing on. */
const ACTIVE = 'suggest-item-active';

/**
 * §69 (5.2) — ↑ ↓ lopen de lijst, Enter kiest de rij.
 *
 * The behaviour the `@`-list has had since round 18, given to the five pickers
 * that draw the same rows and answered no key at all. One line at each call
 * site, because the alternative — an `active` index, an `aria-selected` on
 * every row and a click handler that reads it, five times over — is five
 * copies of one idea, which is the thing round 35 is about.
 *
 * **It drives the DOM rather than the render, on purpose.** These lists are
 * already drawn as plain `<button className="suggest-item">` rows whose count
 * changes when a fetch lands; a hook that owned the highlight in React state
 * would have to be handed the rows, which means changing how all five of them
 * render. Marking the row instead is honest here: the rows are real elements,
 * the highlight *is* a presentational fact about them, and a `MutationObserver`
 * keeps it right when the list is replaced under it.
 *
 * What it deliberately does **not** do is move focus. The caret has to stay in
 * the box: the whole gesture is "keep typing, then take one" — and a focus that
 * hopped onto a row would take the next letter with it.
 *
 * Escape is not here either. That is `useDismiss`, and it goes through the
 * popover pile so one press peels one layer (§69, `lib/popoverStack.ts`).
 */
export function useSuggestKeys({
  open,
  ref,
}: {
  /** True only while the list is really drawn — the same condition `useDismiss` is given. */
  open: boolean;
  /** The element the rows live under. The box itself is fine; it need not be the `<ul>`. */
  ref: RefObject<HTMLElement | null>;
}): { onKeyDown: (event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; nativeEvent?: { isComposing?: boolean }; preventDefault: () => void }) => void } {
  const active = useRef(-1);

  /** Put the mark where the index says, and take it off everywhere else. */
  const paint = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const rows = Array.from(host.querySelectorAll<HTMLElement>(ROW));
    rows.forEach((row, i) => {
      const on = i === active.current;
      row.classList.toggle(ACTIVE, on);
      // A row is a button, not an option, so `aria-selected` would be wrong.
      // `aria-current` is the honest one: this is where you are in the list.
      if (on) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (active.current >= 0 && rows[active.current]) {
      rows[active.current].scrollIntoView({ block: 'nearest' });
    }
  }, [ref]);

  /** How many rows there were last time we looked — a change means a new list. */
  const counted = useRef(0);

  /*
   * Re-applied after **every** commit, deliberately and with no dependency
   * list.
   *
   * React owns `className` on these rows, so anything that re-renders the
   * picker — the debounced fetch landing, a keystroke, a parent's state — puts
   * the row's className back to what the JSX says and quietly takes the mark
   * off. Painting once, from the keystroke, therefore worked for exactly as
   * long as nothing else happened, which in a box that is being typed into is
   * no time at all. (Found by the spec, not by reading.)
   *
   * And when the list itself changed — a fetch replaced the rows — the mark
   * starts again at "nothing highlighted". Enter still takes the first row
   * (`rowForEnter`), so that costs nobody a keystroke; it only stops the
   * highlight from sitting on row four of a list that now holds two names.
   */
  useEffect(() => {
    const host = ref.current;
    if (!open || !host) {
      active.current = -1;
      counted.current = 0;
      return;
    }
    const total = host.querySelectorAll(ROW).length;
    if (total !== counted.current) {
      counted.current = total;
      active.current = -1;
    }
    paint();
  });

  const onKeyDown = useCallback(
    (event: {
      key: string;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      nativeEvent?: { isComposing?: boolean };
      preventDefault: () => void;
    }) => {
      if (!open) return;
      const host = ref.current;
      if (!host) return;
      const rows = Array.from(host.querySelectorAll<HTMLElement>(ROW));
      const what = suggestKey({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent?.isComposing,
      });
      if (what === 'none' || rows.length === 0) return;

      if (what === 'enter') {
        const index = rowForEnter(active.current, rows.length);
        if (index === null) return;
        event.preventDefault();
        rows[index].click();
        return;
      }
      event.preventDefault();
      active.current = nextIndex(active.current, rows.length, what);
      paint();
    },
    [open, ref, paint],
  );

  return { onKeyDown };
}
