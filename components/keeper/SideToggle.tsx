'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Side } from '@/lib/keeper/kinds';
import type { Words } from '@/lib/words';
import { flipRoad, hereFrom, planFlip } from './flipRoad';

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
 * What it does on a click is two questions, both answered by `planFlip`: where
 * this page goes (the hidden mark `KeeperSideMark` renders says so) and which
 * side the browser ends up on.
 *
 * §57: and then it goes there the way everything else that turns the archive
 * over goes there — `GET /api/keeper/flip`, a cookie and a 303. Until this
 * round the button wrote the cookie with a POST and then navigated on the
 * client (`router.push`), which re-rendered the page segment and reused the
 * shared layout's RSC output: the archive flipped and the shell did not. The
 * whole story, and why a document load is the cure rather than a second
 * `refresh()`, is in `flipRoad.ts`.
 *
 * The price is §46's wipe: a document load has no view transition, so the
 * animation left is the button's own half-turn. Correctness first — the shell
 * that stayed behind was not a cosmetic bug (§48's born-on-a-side read it).
 */

export const FLIP_EVENT = 'lw:flip-side';

export function SideToggle({ side, words }: { side: Side; words: Words }) {
  /** Half-turns of the button, so the icon swaps mid-spin. */
  const [turns, setTurns] = useState(0);
  const busy = useRef(false);

  const flip = useCallback(() => {
    // A second press while one flip is in the air does nothing: the archive is
    // already on its way over, and the browser is leaving this document.
    if (busy.current) return;
    busy.current = true;
    setTurns((t) => t + 1);

    const mark = document.querySelector('[data-flip-to]');
    const plan = planFlip(
      mark
        ? {
            flipTo: mark.getAttribute('data-flip-to'),
            // §57: the address above is the fallback list, not a tweeling.
            twinless: mark.hasAttribute('data-flip-none'),
            markSide: mark.getAttribute('data-side'),
          }
        : null,
      side,
      hereFrom(window.location),
    );

    /*
     * §57: one road, and it is the server's. `assign` rather than `replace`
     * so Back still goes back to the page you flipped away from — which, on
     * the way in, will detour itself (`sideDetour`) and turn the archive over
     * again, so Back means what it looks like it means.
     */
    window.location.assign(flipRoad(plan));
  }, [side]);

  /*
   * The `k` shortcut. The guard against typing in a field lives in
   * `UiProvider` beside `n` and `/` — one guard, one place — and reaches us as
   * a plain window event.
   */
  useEffect(() => {
    const onFlip = () => {
      flip();
    };
    window.addEventListener(FLIP_EVENT, onFlip);
    return () => window.removeEventListener(FLIP_EVENT, onFlip);
  }, [flip]);

  const goingToKeeper = side !== 'keeper';
  const label = goingToKeeper ? words.toKeeperSide : words.toPlayerSide;

  return (
    <button
      type="button"
      className="side-toggle"
      data-testid="side-toggle"
      data-side-now={side}
      data-turned={turns > 0 ? '1' : undefined}
      aria-label={label}
      title={label}
      onClick={flip}
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
