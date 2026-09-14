'use client';

import { useEffect, type RefObject } from 'react';
import { closePopover, openPopover } from '@/lib/popoverStack';

/**
 * §69 — one way to close something that floats.
 *
 * A popover is not a `Sheet`. A sheet is modal: it takes the whole screen's
 * attention, traps Tab, dims what is behind it, and `components/ui/Sheet.tsx`
 * has owned all of that since §18b. A popover is the opposite — the page
 * underneath stays live and the thing hanging over it is dismissed by walking
 * away from it. Six components had written that walking-away out by hand, in
 * six copies of the same effect, and no two of them agreed on what Escape did:
 * the three inline pickers answered Escape not at all, and the cover menu and
 * Filters each answered it in their own file.
 *
 * What this hook is:
 *
 *  - **Escape closes it**, and the press goes no further. A popover that is
 *    open is what a press of Escape is about; anything else listening for it
 *    (a canvas clearing its selection, a sheet closing) is one layer out, and
 *    one press should peel one layer. The listener sits on `document` in the
 *    bubble phase, so a `window` listener — which is where both canvases keep
 *    their own priority chain — is still downstream of it and is silenced.
 *  - **a pointer going down anywhere outside `ref` closes it.** On the way
 *    *down*, not on the click: waiting for the click means the press has
 *    already landed on whatever was underneath.
 *  - **focus goes back where it came from**, but only when it is still inside
 *    the panel — somebody who has already clicked elsewhere is not yanked
 *    back. Leave `opener` out when the thing that opened the panel is itself
 *    inside `ref` (the three pickers are a box holding the input *and* the
 *    list, so the caret never leaves and there is nothing to put back).
 *  - **nothing is registered while it is closed.** The six hand-written copies
 *    were three-quarters ungated, so an infobox with ten koppelingsvelden kept
 *    ten live document listeners for a list that was not on the screen.
 *
 * A row inside the panel is *inside* `ref`, so picking one is never an outside
 * press — which is the whole reason the test is `contains` and the reason a
 * panel that lives in a portal cannot use this hook as it stands (see below).
 *
 * ## What is deliberately not on this hook, and why
 *
 * The plan for this round listed nine floating things. Four of them are not
 * here, and each is a reason rather than an omission:
 *
 *  - **The `@`-lijst** (`MentionPopover`) is portalled onto `<body>`, so a
 *    `contains` test against the box it belongs to would call every press on
 *    the list itself "outside". It closes on the box's blur instead, deferred
 *    past the pick, and it reads keys in the **capture** phase on the box. It
 *    does stand on the same pile, though (`lib/popoverStack.ts`) — the pile is
 *    about *ordering against a sheet*, which is the one thing neither of them
 *    could settle alone, and it is the whole of what this hook and that
 *    popover have in common.
 *  - **The stamboom's knoopmenu and kiezer, and the prikbord's zwevende
 *    `BoardPicker`**, hang over a canvas that takes the pointer capture and
 *    keeps an allowlist of what a press may land on (§66, and CLAUDE.md §6).
 *    A document-level `pointerdown` runs *before* that allowlist gets a say,
 *    so closing on the way down would kill the click on the panel's own rows.
 *    They are closed by the stage, which is the one thing that knows.
 *  - **The landkaart's legenda** has no Escape today on purpose: four specs
 *    press Escape on that page to close a speld, and a legend that answered it
 *    first would swallow those. Giving it one is a change to the priority
 *    chain, not a tidy-up, and it belongs with the chain.
 *
 * Which leaves the honest shape of this: it is a de-duplication where six
 * copies really were the same thing, and a named decision everywhere else.
 */
export function useDismiss({
  open,
  onDismiss,
  ref,
  opener,
}: {
  /** Nothing is listening while this is false. */
  open: boolean;
  /** Called at most once per press. Should be stable, or cheap to re-register. */
  onDismiss: () => void;
  /** The panel, and anything a press on it counts as being inside. */
  ref: RefObject<HTMLElement | null>;
  /**
   * Where the caret goes after Escape. Leave it out when the opener lives
   * inside `ref` and therefore never lost focus in the first place.
   */
  opener?: RefObject<HTMLElement | null>;
}): void {
  useEffect(() => {
    if (!open) return;
    /*
     * §69: stand on the popover pile for as long as this is open, so a `Sheet`
     * above lets the press of Escape through to here first. A sheet's key
     * handler is in the capture phase on `document` and could not otherwise be
     * beaten — see `lib/popoverStack.ts`.
     */
    const token = openPopover();

    const leave = () => {
      /*
       * Put the caret back before the panel unmounts, and only if it is still
       * in there. React will have removed the element by the time the state
       * lands, and focus would then fall to `<body>` — which on a long page
       * means the next Tab starts from the top.
       */
      const active = document.activeElement;
      if (opener?.current && ref.current && active && ref.current.contains(active)) {
        opener.current.focus();
      }
      onDismiss();
    };

    const onDown = (event: PointerEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      // No focus to hand back: the press itself is taking it somewhere.
      onDismiss();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      leave();
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      closePopover(token);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onDismiss, ref, opener]);
}
