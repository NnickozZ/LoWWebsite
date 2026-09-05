'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OWN_WRITE_MUTE_MS, useLive } from './LiveProvider';

/**
 * §21: what makes a page live. Every page under `app/(app)` renders one of
 * these — `tests/unit/live-everywhere.test.ts` fails the build of a page that
 * does not — and gets three things for it:
 *
 *   - a *place*: the tab stands here, so the strip shows who else does, and
 *     their hands are drawn (unless the page draws its own, as a board does);
 *   - a *watch list*: when any of these keys moves, the page is re-rendered
 *     from the server (`router.refresh()`), which keeps every server-rendered
 *     list, count and block current without a reload. Client components that
 *     hold their own copy of something use `useLiveChanges` as well;
 *   - the shell's presence strip, on unless the page has its own.
 *
 * Refreshes are coalesced: one every `REFRESH_MIN_MS` at most, however busy
 * the archive is, with the last signal always honoured.
 *
 * Pointer coordinates on an ordinary page are a fraction of the main column's
 * width and a pixel offset from its top — approximate across different window
 * widths, and meant to be: it says *where someone is reading*, not which
 * letter they point at. Boards and maps have their own coordinates and their
 * own cursor layer, and pass `pointers={false}`.
 */

const REFRESH_MIN_MS = 1500;

export function LivePage({
  place,
  watch = [],
  pointers = true,
  presence = true,
  refresh = true,
}: {
  /** Where this page stands: a record key (`case:{id}`) or a fixed page (`page:/wiki`). */
  place: string;
  /** Change keys that should re-render this page. The place itself is always watched. */
  watch?: string[];
  /** Draw other people's hands on this page (and report our own). */
  pointers?: boolean;
  /** Show the shell's strip of who is here. A page with its own strip passes false. */
  presence?: boolean;
  /** Re-render from the server when a watched key moves. */
  refresh?: boolean;
}) {
  const live = useLive();
  const router = useRouter();
  const { setPlace, watch: watchKeys, onChanged, setStripHidden, reportPointer, ownWriteAt } = live;

  useEffect(() => {
    setPlace(place);
    return () => setPlace(null);
  }, [place, setPlace]);

  useEffect(() => {
    setStripHidden(!presence);
    return () => setStripHidden(false);
  }, [presence, setStripHidden]);

  const keys = [...new Set([place, ...watch])].join('\n');
  const lastRefresh = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const list = keys.split('\n');
    const unwatch = watchKeys(list);
    if (!refresh) return unwatch;
    const off = onChanged((changed) => {
      if (!changed.some((key) => list.includes(key))) return;
      // One's own echo: this tab just wrote, and has (or will have) refreshed
      // itself. Refreshing again here can cancel the navigation that follows
      // a create, and re-renders nothing new.
      if (Date.now() - ownWriteAt() < OWN_WRITE_MUTE_MS) return;
      if (refreshTimer.current) return;
      const wait = Math.max(0, REFRESH_MIN_MS - (Date.now() - lastRefresh.current));
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        lastRefresh.current = Date.now();
        router.refresh();
      }, wait);
    });
    return () => {
      unwatch();
      off();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [keys, refresh, watchKeys, onChanged, router, ownWriteAt]);

  /* ------------------------------------------------------------ pointers */

  useEffect(() => {
    if (!pointers) return;
    const main = document.querySelector<HTMLElement>('main.main');
    if (!main) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = main.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = event.clientY - rect.top;
      if (x < 0 || x > 1 || y < 0 || y > rect.height) {
        reportPointer(null);
        return;
      }
      reportPointer({ x, y, m: {} });
    };
    const onLeave = () => reportPointer(null);
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      reportPointer(null);
    };
  }, [pointers, reportPointer]);

  // The layer is portalled onto `main` itself, so its coordinates are the
  // main column's whatever wrapper the page put around this component.
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMainEl(document.querySelector<HTMLElement>('main.main'));
  }, []);

  if (!pointers || !live.pointers.length || !mainEl) return null;

  return createPortal(
    <div className="live-cursors" aria-hidden="true">
      {live.pointers.map((pointer) => (
        <div
          key={pointer.clientId}
          className="board-cursor live-cursor"
          style={{
            left: `${Math.min(1, Math.max(0, pointer.x ?? 0)) * 100}%`,
            top: pointer.y ?? 0,
            ['--cursor-colour' as string]: pointer.colour,
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" className="board-cursor-arrow">
            <path d="M4 3l7.5 17 2.3-7.2L21 10.5z" />
          </svg>
          <span className="board-cursor-name">{pointer.name}</span>
        </div>
      ))}
    </div>,
    mainEl,
  );
}
