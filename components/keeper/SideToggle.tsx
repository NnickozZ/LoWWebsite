'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import type { Side } from '@/lib/keeper/kinds';
import type { Words } from '@/lib/words';

/**
 * §46: de spiegel — the one control that turns the archive over.
 *
 * Not in the side menu (a phone has none, and the two sides are not a *place*
 * you go to but a face the whole archive wears), so it stands in the same
 * corner of the viewport on every screen and on both sizes: a small round
 * button, fixed top-right, left of the live strip's dot — which `globals.css`
 * moves over to make room for it.
 *
 * Rendered for a real Keeper and nobody else. `AppShell` decides that, and it
 * decides it by *not rendering this at all* rather than by hiding it: a
 * player's HTML carries no button and no address to the other side.
 *
 * What it does on a click is two questions:
 *
 *   1. Where does this page go? The page itself says so, in the hidden mark
 *      `KeeperSideMark` renders — `data-flip-to` is the twin, or the list this
 *      kind of thing lives in on the other side, and `data-side` is the side
 *      the *record* is on. A page without a mark (a list, Start, Zoeken, het
 *      web) is on both sides at once: we stay where we are and let the server
 *      render it again for the other side.
 *   2. Which side does the browser end up on? The opposite of the mark's, when
 *      there is one — the destination is the twin, so the side follows it —
 *      and otherwise the opposite of the side we are standing on.
 *
 * The cookie is written first (`POST /api/keeper/flip`), because the whole
 * point is that the page we are about to ask for is rendered on the new side.
 */

export const FLIP_EVENT = 'lw:flip-side';

/** How long we will wait for the new page before letting the wipe finish anyway. */
const FLIP_TIMEOUT_MS = 1500;

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> };
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function SideToggle({ side, words }: { side: Side; words: Words }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  /** Half-turns of the button, so the icon swaps mid-spin. */
  const [turns, setTurns] = useState(0);
  const busy = useRef(false);

  /*
   * The promise the view transition waits on. `useTransition` is the only
   * honest signal that a `push` or a `refresh` has *landed* — the new server
   * components have rendered — so the wipe is held open until pending goes
   * back down, or until the safety timeout, whichever is first.
   */
  const settle = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (pending) return;
    const resolve = settle.current;
    settle.current = null;
    resolve?.();
  }, [pending]);

  const flip = useCallback(async () => {
    // A second press while one flip is in the air does nothing: the archive is
    // already on its way over.
    if (busy.current) return;
    busy.current = true;

    const mark = document.querySelector('[data-flip-to]');
    const dest = mark?.getAttribute('data-flip-to') || null;
    const markSide = mark?.getAttribute('data-side');
    const next: Side = dest
      ? markSide === 'keeper'
        ? 'player'
        : 'keeper'
      : side === 'keeper'
        ? 'player'
        : 'keeper';

    setTurns((t) => t + 1);

    try {
      await fetch('/api/keeper/flip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side: next }),
      });
    } catch {
      // A cookie that did not get set means the page comes back the same side
      // it was; nothing is broken and nothing needs saying.
    }

    const navigate = () =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          settle.current = null;
          resolve();
        };
        settle.current = finish;
        startTransition(() => {
          if (dest) router.push(dest);
          else router.refresh();
        });
        window.setTimeout(finish, FLIP_TIMEOUT_MS);
      });

    const doc = document as ViewTransitionDocument;
    const start = doc.startViewTransition?.bind(doc);

    try {
      // No animation at all where somebody asked for none, and none in a
      // browser without the API (Firefox): there the navigation is simply the
      // navigation, which is what the whole thing degrades to anyway.
      if (!start || prefersReducedMotion()) {
        await navigate();
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty('--flip-x', `${rect ? rect.left + rect.width / 2 : window.innerWidth}px`);
      root.style.setProperty('--flip-y', `${rect ? rect.top + rect.height / 2 : 0}px`);
      // `.finished` rejects when a transition is skipped (another one starts,
      // the tab is hidden). That is not an error worth showing anybody.
      await start(() => navigate()).finished.catch(() => {});
    } finally {
      busy.current = false;
    }
  }, [router, side]);

  /*
   * The `k` shortcut. The guard against typing in a field lives in
   * `UiProvider` beside `n` and `/` — one guard, one place — and reaches us as
   * a plain window event.
   */
  useEffect(() => {
    const onFlip = () => {
      void flip();
    };
    window.addEventListener(FLIP_EVENT, onFlip);
    return () => window.removeEventListener(FLIP_EVENT, onFlip);
  }, [flip]);

  const goingToKeeper = side !== 'keeper';
  const label = goingToKeeper ? words.toKeeperSide : words.toPlayerSide;

  return (
    <button
      ref={buttonRef}
      type="button"
      className="side-toggle"
      data-testid="side-toggle"
      data-side-now={side}
      data-turned={turns > 0 ? '1' : undefined}
      aria-label={label}
      title={label}
      onClick={() => void flip()}
    >
      {/* The half-turn. Keyed on the count so a second press replays it, and
          it lands upright — the icon underneath is the one thing on this
          button that may not end up on its head. */}
      <span key={turns} className="side-toggle-turn">
        <Icon name={goingToKeeper ? 'shield' : 'you'} size={17} />
      </span>
    </button>
  );
}
