'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

export function Sheet({
  children,
  onClose,
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Null until this sheet has taken its place in the pile — and until then it draws nothing. */
  const [depth, setDepth] = useState<number | null>(null);
  const idRef = useRef<number | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = openSheet();
    idRef.current = id;
    setDepth(sheetDepth(id));
    if (openSheetCount() === 1) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      // Everything under the top sheet plays dead: one Escape closes one sheet.
      if (!isTopSheet(id)) return;
      if (event.key === 'Escape') {
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
  }, []);

  /*
   * The panel exists only from the second commit — the first renders nothing,
   * because a portal cannot be made during a server render — so this is where
   * focus can first be moved into it. Skipped when something inside already
   * has it (the `autoFocus` on the confirm sheet's yes), so the sheet never
   * steals focus from its own answer.
   */
  useEffect(() => {
    if (depth === null) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    panel.focus({ preventScroll: true });
  }, [depth]);

  if (depth === null) return null;

  return createPortal(
    <div
      className="sheet-backdrop"
      style={depth > 0 ? { zIndex: SHEET_BASE_Z + depth } : undefined}
      onPointerDown={(event) => {
        if (idRef.current !== null && !isTopSheet(idRef.current)) return;
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
