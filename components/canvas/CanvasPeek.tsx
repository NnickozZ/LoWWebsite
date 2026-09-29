'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { openSheetCount } from '@/lib/sheetStack';
import { popoverIsOpen } from '@/lib/popoverStack';
import { PEEK_SLOP, peekDragOffset, peekRelease } from '@/lib/canvas/peek';
import { AUTHOR_GATE_OFF } from '@/lib/canvas/authorGate';

/**
 * §105: when the last peek went away. A peek that comes within a beat of the
 * one before it (a tap on the next speld remounts it) does not slide in
 * again — the thing changed, the drawer did not.
 */
let lastPeekGone = 0;

function stillMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A token's duration in ms, read off `:root` (`--dur-3` → 150). */
function tokenMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
}

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
 *
 * §105 (golf i1): **de greep is een greep.** The peek follows the thumb while
 * the grip is dragged (`peekDragOffset`) and decides on release
 * (`peekRelease`, `lib/canvas/peek.ts`): up is bigger, down is smaller, and
 * down from small is gone. It comes up from behind the tab bar and goes back
 * behind it — it lies one layer *under* `.tabs`, with a skirt of its own
 * paper below it, so every change of size is a `transform` (§102 rule 3) and
 * never shows the glass through a gap. A press of the cross with a finger gets
 * the exit (`--dur-3`); Escape, or the cross by keyboard, is gone at once
 * (rule 2). Its height is on `:root` as `--peek-now`, so the canvas's own `+`
 * (`.canvas-make`) climbs above it and is never covered.
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
  startFull = false,
  resetKey,
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
  /**
   * §105 (golf J, stuk 4): open big — for a peek whose list is what the person
   * came for (the web, opened from *Verbindingen*). Only the first time; the
   * next thing in it starts small, as always.
   */
  startFull?: boolean;
  /**
   * §105 (golf J): what "a new thing in the same peek" means, when every thing
   * shares one heading id (the web's `#web-panel-title`). Defaults to that id.
   */
  resetKey?: string;
}) {
  const [full, setFull] = useState(startFull);
  const swipe = useRef<{ id: number; y: number; t: number; lastY: number; lastT: number; moved: boolean } | null>(null);
  /** A swipe that ends on the handle must not also count as a tap on it. */
  const swiped = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** §105: slides up from behind the tab bar — unless it replaces one that just went. */
  const [coming, setComing] = useState(() => Date.now() - lastPeekGone > 250);
  /** §105: on its way out (a finger's cross or a swipe down from small). */
  const [leaving, setLeaving] = useState(false);
  /**
   * Review 4 (H2): may this peek grow at all? Only when its body is taller than
   * the small peek shows. A peek that already shows everything has nothing to
   * grow into: the grip then only gives a little (the rubber rim) and closes
   * downward, and the `+` never steps aside for a growth that did not happen.
   */
  const [canGrow, setCanGrow] = useState(false);
  /** §105: the height before a change of size, and where the thumb had it. */
  const flip = useRef<{ from: number; offset: number; still: boolean } | null>(null);

  useEffect(
    () => () => {
      lastPeekGone = Date.now();
    },
    [],
  );

  /** §105: the offset the peek stands at, set straight on the element (no render per frame). */
  const place = (offset: number, animate: 'none' | 'enter' | 'exit') => {
    const el = rootRef.current;
    if (!el) return;
    el.dataset.move = animate;
    el.style.transform = offset ? `translateY(${Math.round(offset)}px)` : '';
  };

  const closeNow = () => onCloseRef.current();
  /**
   * §105: a finger's close. The peek slides back behind the tab bar in
   * `--dur-3` and only then tells its owner. Under reduced motion, at once.
   */
  const closeWithExit = (from = 0) => {
    const el = rootRef.current;
    if (!el || stillMotion()) return closeNow();
    setLeaving(true);
    document.documentElement.style.setProperty('--peek-now', '0px');
    place(from, 'none');
    requestAnimationFrame(() => {
      if (!rootRef.current) return;
      place(rootRef.current.offsetHeight + 8, 'exit');
    });
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      closeNow();
    }, tokenMs('--dur-3', 150) + 30);
  };
  /** The exit's clock: a peek that is replaced or unmounted meanwhile closes nothing. */
  const leaveTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!escape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (openSheetCount() > 0 || popoverIsOpen()) return;
      // §102 rule 2: a key does not move anything.
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escape]);

  /* §105: `--peek-now` on `:root`, so the maker climbs above the peek. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const measure = () => {
      if (leaving) return;
      root.style.setProperty('--peek-now', `${Math.ceil(el.offsetHeight)}px`);
      // Review 4 (H2): the `+` steps aside only for a peek that really took
      // the screen — more than half of it — not for a class name.
      if (el.offsetHeight > window.innerHeight * 0.5) root.dataset.peekHoog = '';
      else delete root.dataset.peekHoog;
      const body = bodyRef.current;
      if (body && !el.classList.contains('is-full')) setCanGrow(body.scrollHeight > body.clientHeight + 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const body = bodyRef.current;
    if (body) {
      observer.observe(body);
      for (const child of Array.from(body.children)) observer.observe(child);
    }
    return () => {
      observer.disconnect();
      root.style.removeProperty('--peek-now');
      delete root.dataset.peekHoog;
    };
  }, [leaving]);

  /*
   * §105: a change of size is a FLIP. The new height is laid out at once; the
   * peek is then drawn where it *was* (plus wherever the thumb had it) and
   * slides to its place. Growing, it comes up from behind the tab bar;
   * shrinking, its skirt fills what it gives back.
   */
  useLayoutEffect(() => {
    const was = flip.current;
    flip.current = null;
    const el = rootRef.current;
    if (!was || !el) return;
    if (was.still || stillMotion()) return place(0, 'none');
    const start = el.offsetHeight - was.from + was.offset;
    place(start, 'none');
    requestAnimationFrame(() => place(0, 'enter'));
  }, [full]);

  const resize = (next: boolean, offset = 0, still = false) => {
    const el = rootRef.current;
    flip.current = { from: el?.offsetHeight ?? 0, offset, still };
    if (next === full) {
      // Nothing to lay out: only the thumb's offset goes home.
      flip.current = null;
      place(offset, 'none');
      requestAnimationFrame(() => place(0, stillMotion() ? 'none' : 'enter'));
      return;
    }
    setFull(next);
  };

  /**
   * How far up the peek can follow the thumb before it is at its big size:
   * big leaves `--peek-gap` (3.5rem) of glass at the top. Read when the thumb
   * lands, before any offset is on the element.
   */
  const roomAtDown = useRef(0);
  const measureRoom = () => {
    const el = rootRef.current;
    if (!el || full) return 0;
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize || '16') * 3.5;
    return Math.max(0, el.getBoundingClientRect().top - gap);
  };
  const room = () => roomAtDown.current;

  const onGripDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || leaving) return;
    const now = performance.now();
    roomAtDown.current = canGrow || full ? measureRoom() : 0;
    swipe.current = { id: event.pointerId, y: event.clientY, t: now, lastY: event.clientY, lastT: now, moved: false };
  };
  const onGripMove = (event: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== event.pointerId) return;
    const dy = event.clientY - s.y;
    if (!s.moved && Math.abs(dy) > PEEK_SLOP) {
      s.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    if (!s.moved) return;
    const now = performance.now();
    s.lastY = event.clientY;
    s.lastT = now;
    // §105: the peek is in the hand — it follows, with no transition.
    place(peekDragOffset(dy, room()), 'none');
  };
  const onGripUp = (event: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== event.pointerId || !s.moved) return;
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 0);
    const dy = event.clientY - s.y;
    const dt = Math.max(1, performance.now() - s.lastT);
    const velocity = dt > 80 ? 0 : (event.clientY - s.lastY) / dt || dy / Math.max(1, performance.now() - s.t);
    const offset = peekDragOffset(dy, room());
    const what = peekRelease(full ? 'full' : 'peek', dy, velocity);
    // Review 4 (H2): nothing to grow into — the rim gives, and goes back.
    if (what === 'grow' && !canGrow) resize(full, offset);
    else if (what === 'grow') resize(true, offset);
    else if (what === 'shrink') resize(false, offset);
    else if (what === 'close') closeWithExit(offset);
    else resize(full, offset);
  };

  // A new thing in the same peek starts small again, at the top.
  const key = resetKey ?? labelledBy ?? label;
  const firstKey = useRef(true);
  useEffect(() => {
    // §105 (golf J): the first thing keeps `startFull`; every next one is small.
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    setFull(false);
    bodyRef.current?.scrollTo?.({ top: 0 });
    // §105: the next thing arrived while this one was leaving — it stays.
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
      setLeaving(false);
      place(0, 'none');
    }
  }, [key]);

  return (
    <section
      ref={rootRef}
      className={`canvas-peek${full ? ' is-full' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      data-testid={testId}
      data-peek={full ? 'full' : 'peek'}
      data-groeit={canGrow || full ? 'ja' : 'nee'}
      data-komt={coming ? '' : undefined}
      data-closing={leaving ? '' : undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setComing(false);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="canvas-peek-grip"
        /* §105 (golf J): the grip and the cross only look — never the question. */
        {...AUTHOR_GATE_OFF}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={() => {
          if (swipe.current?.moved) resize(full, 0);
          swipe.current = null;
        }}
      >
        <button
          type="button"
          className="canvas-peek-handle"
          aria-expanded={full}
          // §64: one name whatever the state; `aria-expanded` says which.
          aria-label="Groter of kleiner"
          title={full ? 'Kleiner' : 'Groter'}
          onClick={(event) => {
            if (swiped.current) return;
            if (!full && !canGrow) {
              // Review 4 (H2): it shows everything already. A small lift and
              // back says so; a key or reduced motion gets nothing at all.
              if (event.detail === 0 || stillMotion()) return;
              place(-10, 'none');
              requestAnimationFrame(() => requestAnimationFrame(() => place(0, 'enter')));
              return;
            }
            // §102 rule 2: by keyboard the size changes without a journey.
            resize(!full, 0, event.detail === 0);
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
          onClick={(event) => {
            // §102 rule 2: Enter or space on the cross is a key — gone at once.
            if (event.detail === 0) closeNow();
            else closeWithExit();
          }}
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
