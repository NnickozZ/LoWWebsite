'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Side } from '@/lib/keeper/kinds';
import { capitalise, type Words } from '@/lib/words';
import { FLIP_NOTE, flipRoad, hereFrom, planFlip } from './flipRoad';

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
 * §102: and the wipe is back. A document load *can* carry a view transition —
 * a cross-document one (`@view-transition` in `kaartje.css`) — as long as the
 * road stays same-origin, and the 303 does. The old document leaves a note in
 * `sessionStorage` (`FLIP_NOTE`: where the circle starts, and when), and the
 * little script in the root layout's `<head>` reads it on both ends: no fresh
 * note, no transition. So only a flip with a hand on it draws the circle — the
 * `k` key and `>` in the palet ring `FLIP_EVENT` without an origin, and a
 * keyboard action does not move (§102, decision 2).
 */

export const FLIP_EVENT = 'lw:flip-side';

/** Where a hand pressed: the centre of the thing it pressed, in viewport px. */
export type FlipOrigin = { x: number; y: number };

/**
 * §102: `FLIP_EVENT` with the hand's origin on it. Only for a click that came
 * from a pointer — `detail` is 0 when Enter or Space pressed the button, and a
 * keyboard action does not move — so a caller can pass any click straight in.
 */
export function flipEventFrom(event: { detail: number; currentTarget: EventTarget | null }): Event {
  const target = event.currentTarget;
  const origin = event.detail > 0 && target instanceof Element ? centreOf(target) : null;
  return new CustomEvent<{ origin: FlipOrigin | null }>(FLIP_EVENT, { detail: { origin } });
}

function centreOf(element: Element): FlipOrigin {
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}

/**
 * §102, golf h1 (D4): where the toggle is drawn. `hoek` is §46's round button in the
 * corner — the phone keeps it, beside `jij-flip` in the Jij-blad. `mast` is the
 * desk's: a segmented switch `[Spelers | Keeper]` in the side menu's masthead,
 * where the stamp KEEPERKANT used to stand. The corner pill it replaces cost
 * every Keeper page a band of 36 px and every canvas a 12 rem margin, and it
 * looked like a status stamp while it said where it would *go*. `AppShell`
 * renders exactly one of the two (`useIsPhone`), so `side-toggle` is one
 * element and `k` has one listener.
 */
export type SideToggleVariant = 'hoek' | 'mast';

export function SideToggle({ side, words, variant = 'hoek' }: { side: Side; words: Words; variant?: SideToggleVariant }) {
  /** Half-turns of the button, so the icon swaps mid-spin. */
  const [turns, setTurns] = useState(0);
  const busy = useRef(false);

  const flip = useCallback((origin: FlipOrigin | null) => {
    // A second press while one flip is in the air does nothing: the archive is
    // already on its way over, and the browser is leaving this document.
    if (busy.current) return;
    busy.current = true;
    // §102: the half-turn is the hand's too. From `k` or the palet the page
    // simply becomes the other page.
    if (origin) setTurns((t) => t + 1);

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
     *
     * §102: the note goes in last, the moment before we leave, so "fresh"
     * (under 3 s, `FLIP_SCRIPT`) is measured from the press and not from
     * anything slower in between. A browser that will not store it simply
     * gets no circle.
     */
    if (origin) {
      try {
        sessionStorage.setItem(FLIP_NOTE, JSON.stringify({ x: origin.x, y: origin.y, at: Date.now() }));
      } catch {
        /* no circle, the same page */
      }
    }
    window.location.assign(flipRoad(plan));
  }, [side]);

  /*
   * The `k` shortcut. The guard against typing in a field lives in
   * `UiProvider` beside `n` and `/` — one guard, one place — and reaches us as
   * a plain window event.
   */
  useEffect(() => {
    const onFlip = (event: Event) => {
      // A plain `Event` (the `k` key, the palet) carries no origin: no circle.
      const detail = (event as CustomEvent<{ origin?: FlipOrigin | null } | null>).detail;
      flip(detail?.origin ?? null);
    };
    window.addEventListener(FLIP_EVENT, onFlip);
    return () => window.removeEventListener(FLIP_EVENT, onFlip);
  }, [flip]);

  const goingToKeeper = side !== 'keeper';
  const label = goingToKeeper ? words.toKeeperSide : words.toPlayerSide;

  if (variant === 'mast') {
    return (
      <button
        type="button"
        className="side-switch"
        data-testid="side-toggle"
        data-side-now={side}
        data-going={turns > 0 ? '1' : undefined}
        aria-label={label}
        title={label}
        onClick={(event) => {
          // §102, golf h1 (D4): the circle starts from the half you are going to —
          // that is where the hand is headed. `detail` 0 (Enter, Space): no
          // origin, no circle, no slide (§102: a keyboard action does not move).
          if (event.detail === 0) return flip(null);
          const to = event.currentTarget.querySelector(`[data-half="${goingToKeeper ? 'keeper' : 'player'}"]`);
          flip(centreOf(to ?? event.currentTarget));
        }}
      >
        {/* The thumb: the raised half under the side you stand on. It slides
            to the other half on a press, while the document is on its way. */}
        <span className="side-switch-thumb" aria-hidden="true" />
        <span className="side-switch-half" data-half="player" data-on={goingToKeeper ? '1' : undefined} aria-hidden="true">
          {goingToKeeper && <Icon name="shield" size={12} />}
          {words.sideSwitchPlayers}
        </span>
        {/* §46: on the Keeper's side this half *is* the masthead's word for it
            (`masthead-side`, which specs and the eye both look for). */}
        <span
          className="side-switch-half"
          data-half="keeper"
          data-on={goingToKeeper ? undefined : '1'}
          data-testid={goingToKeeper ? undefined : 'masthead-side'}
          aria-hidden="true"
        >
          {!goingToKeeper && <Icon name="shield" size={12} />}
          {words.sideSwitchKeeper}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="side-toggle"
      data-testid="side-toggle"
      data-side-now={side}
      data-turned={turns > 0 ? '1' : undefined}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // §102: `detail` is 0 when Enter or Space pressed it — no origin, no circle.
        flip(event.detail > 0 ? centreOf(event.currentTarget) : null);
      }}
    >
      {/* The half-turn. Keyed on the count so a second press replays it, and
          it lands upright — the icon underneath is the one thing on this
          button that may not end up on its head. */}
      <span key={turns} className="side-toggle-turn">
        <Icon name={goingToKeeper ? 'shield' : 'you'} size={17} />
      </span>
      {/* §91: a word beside the icon — hidden on a phone (CSS), where the
          corner has room for the circle only; the accessible name is the
          `aria-label` above either way and does not change (§64). */}
      <span className="side-toggle-word" aria-hidden="true">
        {goingToKeeper ? words.keeperSide : capitalise(words.playerSide)}
      </span>
    </button>
  );
}
