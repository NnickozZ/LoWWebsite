import type { Side } from '@/lib/keeper/kinds';
import type { Words } from '@/lib/words';

/**
 * §57: the one road the archive turns over on.
 *
 * §46 gave the toggle two roads: `POST /api/keeper/flip` to write the cookie
 * and then a client-side `router.push` (or a `router.refresh`) to fetch the
 * page again. The push is where it went wrong. `/e/het-complot` and `/wiki`
 * hang under the same `app/(app)/layout.tsx`, so Next re-renders the page
 * segment and *reuses the layout's RSC output from the client router cache* —
 * and the layout is the thing that knows which side this browser stands on.
 * So after a flip with no tweeling the archive was on the players' side and
 * the shell still said Keeper: the button's own `data-side-now`, the shield
 * under the masthead, the palette (`[data-side]` on the shell's wrapper is the
 * only one on a list page), and — the one that is not cosmetic —
 * `UiProvider`'s `side`, which is §48's "born on a side": something made from
 * that stale shell was made **keeper-only** while the cookie said player.
 *
 * The road here is the one §50 already built for the other direction. The
 * toggle sends the browser to `GET /api/keeper/flip?side=…&to=…`, which sets
 * the cookie and answers 303. That is a document load, so the layout, the
 * palette, the masthead, the toggle and `UiProvider` are all rendered on the
 * new side by construction — there is no ordering to get right and no cache to
 * out-think. It is also, since §50, the only writer of that cookie, and now
 * the only way anybody crosses: `sideDetour()`, `/keeper` and this button all
 * take it.
 *
 * Everything in this file is pure and knows nothing about the DOM, so the two
 * decisions it makes — where a press goes, and what the landing says — are
 * unit-testable without a browser (`tests/unit/flip-road.test.ts`).
 */

/** §50: "you have just been switched", so the page that lands can say so. */
export const SWITCHED_PARAM = 'gewisseld';
/** §57: "…and there was no tweeling, so this is the list, not the other face." */
export const TWINLESS_PARAM = 'zondertweeling';

/** What the page's hidden mark (`KeeperSideMark`) says, read off the DOM. */
export type FlipMark = {
  /** Where the toggle goes from here: the tweeling, or the list this kind lives in. */
  flipTo: string | null;
  /** §57: true when `flipTo` is the fallback list because this thing has no tweeling. */
  twinless: boolean;
  /** Which side the *record* is on — not the browser. */
  markSide: string | null;
};

export type FlipPlan = {
  /** The side the browser ends up on. */
  next: Side;
  /** Where it lands. */
  to: string;
  /** Whether that landing is a list we fell back to. */
  twinless: boolean;
};

function other(side: Side): Side {
  return side === 'keeper' ? 'player' : 'keeper';
}

/**
 * §46/§57: the two questions a press asks.
 *
 *   1. Where does this page go? The mark says so: the tweeling, or the list
 *      this kind of thing lives in on the other side. A page with no mark (a
 *      list, Start, Zoeken, het web) is on both sides at once and stays where
 *      it is — `here` — to be rendered again for the other side.
 *   2. Which side does the browser end up on? The opposite of the *mark's*,
 *      when there is one — the destination follows the record — and otherwise
 *      the opposite of the side we are standing on.
 *
 * Unchanged from §46 on purpose: only the road taken afterwards is new, and
 * `twinless` rides along so the landing can use a different sentence.
 */
export function planFlip(mark: FlipMark | null, standing: Side, here: string): FlipPlan {
  const dest = mark?.flipTo || null;
  return {
    next: dest ? other(mark?.markSide === 'keeper' ? 'keeper' : 'player') : other(standing),
    to: dest ?? here,
    twinless: Boolean(dest && mark?.twinless),
  };
}

/**
 * §57: the plan as an address. `to` is percent-encoded into one parameter and
 * vetted again by `safePath` on the other end; the flags are read there and
 * hung back on the destination by the route, never carried inside `to`.
 */
export function flipRoad(plan: FlipPlan): string {
  const params = new URLSearchParams({ side: plan.next, to: plan.to, [SWITCHED_PARAM]: '1' });
  if (plan.twinless) params.set(TWINLESS_PARAM, '1');
  return `/api/keeper/flip?${params.toString()}`;
}

/**
 * The address we are standing on, without the flags a previous landing left on
 * it — otherwise a second flip from a list would announce the first one again.
 */
export function hereFrom(location: { pathname: string; search: string; hash: string }): string {
  const params = new URLSearchParams(location.search);
  params.delete(SWITCHED_PARAM);
  params.delete(TWINLESS_PARAM);
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}

/** What a landing carries, read off its query string. */
export function readLanding(search: string): { switched: boolean; twinless: boolean } {
  const params = new URLSearchParams(search);
  return {
    switched: params.get(SWITCHED_PARAM) === '1',
    twinless: params.get(TWINLESS_PARAM) === '1',
  };
}

/**
 * §57: the sentence.
 *
 * Two of them, because arriving on a list is the thing that reads as broken:
 * if the page you asked for has no other face, say that, and say where you are
 * standing now. "deze pagina" rather than "dit artikel" on purpose — the kind
 * words are the Keeper's to rename (`words.entry` may become anything), and
 * Dutch would then need to know whether the new word takes *dit* or *deze*.
 * Nothing else in the sentence is hardcoded: both side names and both version
 * names come from `Woorden`.
 */
export function switchedMessage(side: Side, twinless: boolean, words: Words): string {
  const sideWord = side === 'keeper' ? words.keeperSide : words.playerSide;
  const standing = `Je staat nu aan de ${sideWord}.`;
  if (!twinless) return standing;
  const version = side === 'keeper' ? words.keeperVersion : words.playerVersion;
  return `Er is geen ${version} van deze pagina — ${standing.charAt(0).toLowerCase()}${standing.slice(1)}`;
}
