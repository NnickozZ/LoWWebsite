'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
 */
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
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
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      // Back to where the person was before the sheet opened — but only if
      // focus is still inside the sheet (or nowhere); a person who has already
      // clicked elsewhere is not yanked back.
      const active = document.activeElement;
      const inSheet = !active || active === document.body || panelRef.current?.contains(active);
      if (inSheet) previouslyFocused?.focus?.();
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="sheet-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panelRef}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
