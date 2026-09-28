'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { popoverIsOpen } from '@/lib/popoverStack';
import {
  SHEET_BASE_Z,
  closeSheet,
  isTopSheet,
  openSheet,
  openSheetCount,
  sheetDepth,
} from '@/lib/sheetStack';

/**
 * Bottom sheet on phones, centred panel on desktop (§6). Escape and a tap on
 * the backdrop both close it; focus is trapped while it is open.
 *
 * Rendered through a portal onto <body>: a sheet opened from inside the side
 * menu (which is sticky, and so a stacking context of its own) would otherwise
 * sit *under* the page it is supposed to cover.
 *
 * The key handler and the focus bookkeeping run exactly once, for the life of
 * the sheet, and read the latest `onClose` through a ref. They used to re-run
 * whenever `onClose` changed — and every caller passes an inline arrow, so
 * that was every render: each keystroke in a field inside the sheet tore the
 * effect down, which handed focus back to the button that opened the sheet,
 * and set it up again with *that* button as the thing to return to. Typing in
 * "Landkaart ophangen" lost the field on every key. (Nick, 5 Sep 2026.)
 *
 * §18b: and a sheet knows now whether it is the one on top. The app's own
 * roads never put two on screen — anything that wants a sheet asks "met wie
 * ben je nu aan het schrijven?" *before* opening it rather than over it (see
 * `ensureAuthor` in `AuthorProvider`) — but one road cannot be sequenced: the
 * archive can refuse a write with `needsAuthor` at any moment, and that moment
 * may well be while a sheet is open. So the primitive has to survive a pile,
 * and everything that was silently shared between sheets is now settled by
 * `lib/sheetStack`:
 *
 *  - **Escape and Tab** belong to the top sheet only. They used to belong to
 *    all of them at once, because `stopPropagation` on a capture listener does
 *    not silence the sibling listener on the same node — so one press closed
 *    the sheet *underneath* the blocking question and left the question
 *    standing over an empty page.
 *  - **the backdrop** likewise, so a tap that lands on the pile only ever
 *    dismisses what is in front.
 *  - **the scroll lock** is taken by the first sheet to open and put back by
 *    the last to close. Each sheet used to save and restore `overflow` for
 *    itself, so the *first* one to unmount handed the page its scrollbar back
 *    while a sheet was still standing over it.
 *  - **`z-index`** counts up with the depth, because two portals at the same
 *    one are ordered by which happened to mount first.
 *  - **focus** moves into the panel when it opens, unless something inside it
 *    already asked for it (`autoFocus`). Without that a sheet opening over an
 *    editor left the caret in the text underneath, and the person went on
 *    typing into a page they could no longer see.
 */

/**
 * What `<body>` had before any sheet touched it — saved by the first to open,
 * put back by the last to close. Module scope, because that is the honest
 * lifetime of the thing being borrowed: the page has one scrollbar.
 */
let bodyOverflow: string | null = null;

/**
 * §102 (J3): how long the way out may take before the sheet goes anyway. The
 * exit itself is `--dur-3` (150 ms) in CSS; this is the net under it — a tab
 * in the background, an animation that never starts — so a sheet can never
 * stay standing, invisible and inert, over the page.
 */
export const SHEET_EXIT_NET_MS = 250;

/** The name of the panel's way out in `globals.css` — the one `animationend` that counts. */
const EXIT_ANIMATIONS = new Set(['sheet-down', 'sheet-fade-out']);

export function Sheet({
  children,
  onClose,
  labelledBy,
  closable = true,
  className,
  exit = true,
  onLeave,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  /**
   * §90: false for the one sheet that may not be walked away from — §18b's
   * blocking "met wie ben je nu aan het schrijven?". It had a cross that did
   * nothing, which is the worst kind of button there is. The note on the cross
   * below still stands for everything else: a question you may walk away
   * from gets a cross that means *no*.
   *
   * §101: it is the **cross and the backdrop** that this switches off, not
   * Escape. Escape peels one layer everywhere else in the archive, and the one
   * sheet that refused it was the one people met most often; since this round
   * every maker asks *before* it makes (`ensureAuthor`), so there really is
   * something to cancel and cancelling it makes nothing. A stray tap beside
   * the sheet is still not an answer, which is why the backdrop goes quiet
   * here rather than closing too.
   */
  closable?: boolean;
  /**
   * §100: a modifier on the backdrop, for the one sheet that is not a bottom
   * sheet on a phone — the palet stands at the top, above the keyboard.
   */
  className?: string;
  /**
   * §102 (J3): whether a close by the cross or the backdrop plays the way out
   * (150 ms, `--ease-exit`) before `onClose` runs. False for the palet: it
   * opens without moving because a keyboard action does not move, and it
   * closes the same way.
   *
   * Only those two closes ever animate. Escape is a key, so it closes at once;
   * and a sheet its parent takes away itself (a form sent, a question
   * answered with *Ja* or *Nee*) is simply gone — there is no delay anywhere
   * on that road, so a `confirm()` promise never answers late.
   */
  exit?: boolean;
  /**
   * §102: called at the first moment of a close by hand, before the way out
   * plays — for a caller whose *answer* must not wait on the drawing. The
   * confirm question settles its promise here; `onClose` still follows when
   * the sheet is gone. Not called for Escape or an unmount: those are
   * `onClose` at once anyway.
   */
  onLeave?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Null until this sheet has taken its place in the pile — and until then it draws nothing. */
  const [depth, setDepth] = useState<number | null>(null);
  const idRef = useRef<number | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  /*
   * §102 (J3): the way out. `closing` is only the drawing (`data-closing`,
   * `inert`); everything a person can *feel* happens in `leave()` at the first
   * moment — off the pile, the scroll lock back, focus back — so the 150 ms
   * that follow are a picture of a sheet that is already gone. `finish()` is
   * the real `onClose`, once, whichever comes first: the `animationend`, the
   * net, or an Escape pressed while it is still fading.
   */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const finishedRef = useRef(false);
  const netRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Undoes the pile, the scroll lock and the focus — once. Filled in by the effect below. */
  const leaveRef = useRef<() => void>(() => {});

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (netRef.current) clearTimeout(netRef.current);
    netRef.current = null;
    onCloseRef.current();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** A close by the pointer: the cross, or a tap on the backdrop. */
  const closeByHand = () => {
    if (closingRef.current || finishedRef.current) return;
    if (!exitRef.current) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    leaveRef.current();
    onLeaveRef.current?.();
    setClosing(true);
    netRef.current = setTimeout(() => finishRef.current(), SHEET_EXIT_NET_MS);
  };

  useEffect(() => {
    const id = openSheet();
    idRef.current = id;
    setDepth(sheetDepth(id));
    if (openSheetCount() === 1) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      closeSheet(id);
      if (openSheetCount() === 0) {
        document.body.style.overflow = bodyOverflow ?? '';
        bodyOverflow = null;
      }
      // Back to where the person was before the sheet opened — but only if
      // focus is still inside the sheet (or nowhere); a person who has already
      // clicked elsewhere is not yanked back.
      const active = document.activeElement;
      const inSheet = !active || active === document.body || panelRef.current?.contains(active);
      if (inSheet) previouslyFocused?.focus?.();
    };
    leaveRef.current = leave;

    const onKey = (event: KeyboardEvent) => {
      /*
       * §102: a sheet already on its way out is off the pile, so the check
       * below would ignore it — but an Escape pressed during those 150 ms is
       * still meant for it. It ends the exit at once (a key does not move) and
       * is this sheet's only if nothing else is open to claim it.
       */
      if (closingRef.current) {
        if (event.key === 'Escape') {
          if (openSheetCount() === 0) event.stopPropagation();
          finishRef.current();
        }
        return;
      }
      // Everything under the top sheet plays dead: one Escape closes one sheet.
      if (!isTopSheet(id)) return;
      if (event.key === 'Escape') {
        /*
         * §69: a popover open inside this sheet takes the press first. This
         * handler is in the **capture** phase on `document`, so it is upstream
         * of anything the popover could register — it cannot win by listening,
         * it can only be asked about. One press peels one layer: the list goes,
         * and the next press is this sheet's. Escape only; Tab below still
         * belongs to the top sheet, because a popover traps no focus.
         */
        if (popoverIsOpen()) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (netRef.current) clearTimeout(netRef.current);
      netRef.current = null;
      // The parent took the sheet away (or the exit ended): the same undoing,
      // unless the way out already did it.
      leave();
    };
  }, []);

  /*
   * The panel exists only from the second commit — the first renders nothing,
   * because a portal cannot be made during a server render — so this is where
   * focus can first be moved into it. Skipped when something inside already
   * has it (the `autoFocus` on the confirm sheet's yes), so the sheet never
   * steals focus from its own answer.
   */
  /*
   * §101: and a box that should have the caret says so with `data-autofocus`.
   * A child's own `useEffect(() => box.focus(), [])` runs on the first commit,
   * when there is no box yet (ronde 51 found it in `NewEntrySheet`, B16/S7) —
   * and `NewCaseSheet` had the same effect, so a new dossier opened with the
   * caret on the panel. A `setTimeout` guessed at the second commit instead.
   * This is the one place that knows when the panel exists, so it is the one
   * place that moves the caret into it.
   */
  useEffect(() => {
    if (depth === null) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const wanted = panel.querySelector<HTMLElement>('[data-autofocus]');
    if (wanted) {
      wanted.focus({ preventScroll: true });
      if (wanted instanceof HTMLInputElement) wanted.select();
      return;
    }
    panel.focus({ preventScroll: true });
  }, [depth]);

  if (depth === null) return null;

  return createPortal(
    <div
      className={className ? `sheet-backdrop ${className}` : 'sheet-backdrop'}
      style={depth > 0 ? { zIndex: SHEET_BASE_Z + depth } : undefined}
      // §102: on its way out the sheet is a picture — no clicks, no focus, no
      // screen reader. `pointer-events: none` in CSS lets a click that lands
      // during those 150 ms reach the page underneath (canvas specs press with
      // `page.mouse`, and so do people).
      data-closing={closing ? '' : undefined}
      inert={closing}
      onPointerDown={(event) => {
        // §101: a sheet with no cross has no backdrop either — see `closable`.
        if (!closable) return;
        if (idRef.current !== null && !isTopSheet(idRef.current)) return;
        if (event.target === event.currentTarget) closeByHand();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={panelRef}
        onAnimationEnd={(event) => {
          if (!closingRef.current) return;
          if (event.target !== event.currentTarget) return;
          if (EXIT_ANIMATIONS.has(event.animationName)) finish();
        }}
      >
        <div className="sheet-handle" />
        {/*
         * §69 (4.6): één kruisje, en het zit hier.
         *
         * Eight sheets drew their own, in a header row of their own, with the
         * same six lines of JSX each; the other dozen drew none, so whether a
         * blad could be closed with the pointer depended on which blad it was.
         * A phone has no Escape key and the backdrop is a thin strip beside a
         * sheet that is nearly full width, so "none" meant *stuck* for anyone
         * who did not know to swipe at the edge.
         *
         * It is `onCloseRef`, not `onClose`: the handler is stable for the life
         * of the sheet and reads the newest one, the same way the key handler
         * above does, and for the same reason (every caller passes an inline
         * arrow).
         *
         * On a confirm sheet the cross is simply the same answer as *Nee* —
         * Nick's call, and the honest one: a question you may not walk away
         * from is a question that has to be asked differently, not a dialog
         * with the exit taken off.
         */}
        {closable && (
          <button
            type="button"
            className="sheet-close"
            aria-label="Sluiten"
            title="Sluiten (Esc)"
            onClick={(event) => {
              // §102: Enter or Space on the cross is a key (`detail` 0), and a
              // key does not move — the same road as Escape.
              if (event.detail === 0) onCloseRef.current();
              else closeByHand();
            }}
          >
            <Icon name="close" size={18} />
          </button>
        )}
        {/*
         * `display: contents`, dus dit vakje bestaat niet voor de opmaak — en
         * wél voor een selector. Het kruisje hierboven zweeft in de hoek, en
         * een blad waarvan de bovenste rij rechts een knop heeft (het
         * Filters-paneel heeft er een die `Klaar` heet) kreeg het kruisje
         * bovenop die knop: onindrukbaar, en op een telefoon waar het kruisje
         * 44 px is helemaal. Ruimte reserveren met `:first-child` op `.sheet`
         * zelf kán niet — de greep en het kruisje zijn daar de eerste kinderen
         * — dus krijgt de inhoud één omhulsel dat niets doet behalve gevonden
         * worden. (Gevonden door `sort-filter` op het phone-project.)
         */}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
