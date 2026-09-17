'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { openSheetCount } from '@/lib/sheetStack';
import { popoverIsOpen } from '@/lib/popoverStack';

/**
 * §74 — een kaartje dat van onderen opkomt, en de rest van het glas laat staan.
 *
 * Nick, round 37: *"Opening some cards and images and timeline events is way
 * too big on phone, to a point where if you open one it just covers the
 * screen."* The worst two were modal `Sheet`s (a speld on a landkaart, a knot
 * of the web) — up to 92 % of the screen, with a scrim that made the drawing
 * underneath untouchable — and the tijdlijn's lade, which was docked but spent
 * four fifths of itself on an uncapped picture.
 *
 * So on a phone, what a tap opens is this: **a peek**.
 *
 * - **Small first.** It rises to at most about a third of the screen
 *   (`--peek-h`) and holds what the thing *is* before what you can do to it —
 *   the caller orders its children that way. Everything else is still there,
 *   below, in the same scrolling body: nothing is hidden behind a second
 *   screen, so a spec (or a thumb) that wants "Speld weghalen" scrolls to it.
 * - **Grows on request.** A tap on the grip, or a swipe up on the grip or the
 *   header, gives it most of the screen (`--peek-h-full`); a swipe down gives
 *   the room back, and a swipe down from small closes it.
 * - **Never modal.** No scrim, no focus trap, no scroll lock: the drawing above
 *   stays pannable and the next speld is one tap away — which is what §69
 *   already learned about panels over a canvas. It stops its own pointer
 *   events, so a press on it is never a press on the glass (§6).
 * - **`role="dialog"` without `aria-modal`**, labelled by the caller's heading,
 *   so `getByRole('dialog', { name })` finds it on a phone the way it finds the
 *   desktop panel.
 * - **Escape closes it**, unless a `Sheet` or a popover is on top — those peel
 *   first (§69's popover pile).
 */
export function CanvasPeek({
  labelledBy,
  label,
  onClose,
  children,
  className,
  testId,
  closeLabel = 'Sluiten',
  escape = true,
  headerExtra,
}: {
  /** Id of the heading inside that names this peek. */
  labelledBy?: string;
  /** Or a name, when there is no single heading. */
  label?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  testId?: string;
  closeLabel?: string;
  escape?: boolean;
  /** Buttons that belong in the grip row beside the cross (e.g. "Alles inklappen"). */
  headerExtra?: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const swipe = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  /** A swipe that ends on the handle must not also count as a tap on it. */
  const swiped = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!escape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (openSheetCount() > 0 || popoverIsOpen()) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escape]);

  const onGripDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    swipe.current = { id: event.pointerId, y: event.clientY, moved: false };
  };
  const onGripMove = (event: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== event.pointerId) return;
    if (Math.abs(event.clientY - s.y) > 8 && !s.moved) {
      s.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
  };
  const onGripUp = (event: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== event.pointerId || !s.moved) return;
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 0);
    const dy = event.clientY - s.y;
    if (dy < -24) setFull(true);
    else if (dy > 24) {
      if (full) setFull(false);
      else onCloseRef.current();
    }
  };

  // A new thing in the same peek starts small again, at the top.
  const key = labelledBy ?? label;
  useEffect(() => {
    setFull(false);
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [key]);

  return (
    <section
      className={`canvas-peek${full ? ' is-full' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      data-testid={testId}
      data-peek={full ? 'full' : 'peek'}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="canvas-peek-grip"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <button
          type="button"
          className="canvas-peek-handle"
          aria-expanded={full}
          // §64: one name whatever the state; `aria-expanded` says which.
          aria-label="Groter of kleiner"
          title={full ? 'Kleiner' : 'Groter'}
          onClick={() => {
            if (swiped.current) return;
            setFull((was) => !was);
          }}
        >
          <span aria-hidden="true" />
        </button>
        {headerExtra}
        <button
          type="button"
          className="canvas-peek-close"
          aria-label={closeLabel}
          title={`${closeLabel} (Esc)`}
          onClick={() => onCloseRef.current()}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="canvas-peek-body" ref={bodyRef}>
        {children}
      </div>
    </section>
  );
}
