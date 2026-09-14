'use client';

import { useEffect, useMemo } from 'react';
import { useLiveBase, useLivePointers } from '@/components/live/LiveProvider';
import type { GraphNodeId } from '@/lib/families/types';

/**
 * §67 — wie op deze stamboom wát vasthoudt, en welk vak er open staat.
 *
 * The prikbord's half of `useBoardLive` that has nothing to do with a prikbord:
 * telling the site line which cards this hand has chosen, and reading back the
 * two things everybody else's hands are saying — what *they* have chosen
 * (`holding`, which comes through the roster) and the selection box they are
 * dragging open right now (`s`, which rides the pointer frame).
 *
 * It is a hook of its own rather than four lines in the canvas for the same
 * reason `useMarqueeSelect` is: it is the second surface to want it and it will
 * not be the last. The tree's own line (`useTreeSync`) is the save and the
 * pull; presence has always been the *site* line's, and a stamboom is a place
 * on it (`family_tree:{id}`), so the roster and the pointer fan-out come for
 * free — see `useBoardLive`, which does exactly this against `board:{id}`.
 *
 * Three deliberate differences from the wall:
 *
 *  - the ids are `GraphNodeId`s (`entry:{id}` / `loose:{id}`), which the site
 *    line has known how to carry since §66;
 *  - nothing here is *state*: the tree has no snap-back to smooth over, because
 *    a carried card is kept by the canvas itself (`carried`, out of the `m`
 *    field) and put back the moment the pull lands;
 *  - the open box is **not** taken off the wire here. A frame is a *state* on
 *    the site line — the fields nobody mentions keep their last value — so
 *    somebody has to say when the box is closed, and that somebody is the hand
 *    that opened it: `useMarqueeSelect` broadcasts `null` on the way up, and
 *    the canvas's `sendFrame` passes it on.
 */

/** Somebody else, as the roster gives them. */
export type TreeHolder = { clientId: string; name: string; colour: string };

/** A selection box somebody else is dragging open, in *world* coordinates. */
export type TreeMarquee = TreeHolder & { x: number; y: number; width: number; height: number };

/**
 * A box is a gesture in progress, so it is dropped much sooner than a cursor:
 * a hand that goes quiet mid-drag has let go, and a rectangle left hanging on
 * the glass is worse than none. The prikbord's number, for the prikbord's
 * reason.
 */
const MARQUEE_TTL_MS = 4000;

/**
 * How many ids one hand may say it is holding. The hub caps the list at sixty
 * (`setPlace` in `lib/live/hub.ts`); this stays under it so a selection of two
 * hundred does not arrive silently truncated in the middle.
 */
export const HOLDING_LIMIT = 60;

export function useTreeHolding({
  clientId,
  holding,
}: {
  /** This tab's own id, so its own hand is left out of what it draws. */
  clientId: string;
  /** The nodes this hand has chosen, for everybody else to see. */
  holding: readonly GraphNodeId[];
}): {
  heldByOthers: Map<GraphNodeId, TreeHolder>;
  marquees: TreeMarquee[];
} {
  const { people, setHolding } = useLiveBase();
  const hands = useLivePointers();

  /*
   * A string, so a selection that is the same six ids in the same order does
   * not re-post itself on every render. `setHolding` compares too, but it is
   * cheaper to not call it than to call it and be told nothing changed.
   */
  const holdingKey = holding.slice(0, HOLDING_LIMIT).join(',');
  useEffect(() => {
    setHolding(holdingKey ? holdingKey.split(',') : []);
  }, [holdingKey, setHolding]);
  // Leaving the tree takes this hand's outlines off everybody else's glass.
  useEffect(() => () => setHolding([]), [setHolding]);

  /**
   * Node id → the first *other* person holding it. One outline per card: two
   * people on one card is rare and two rings round it would be soup.
   */
  const heldByOthers = useMemo(() => {
    const map = new Map<GraphNodeId, TreeHolder>();
    for (const person of people) {
      if (person.clientId === clientId) continue;
      for (const id of person.holding) {
        if (!map.has(id)) map.set(id, { clientId: person.clientId, name: person.name, colour: person.colour });
      }
    }
    return map;
  }, [people, clientId]);

  /**
   * Everybody else's open box, normalised to a positive rectangle here rather
   * than in the renderer: a box dragged up and to the left arrives with its
   * corners the other way round.
   */
  const marquees = useMemo<TreeMarquee[]>(() => {
    const out: TreeMarquee[] = [];
    const fresh = Date.now() - MARQUEE_TTL_MS;
    for (const hand of hands) {
      if (!hand.s || hand.at < fresh || hand.clientId === clientId) continue;
      const [x0, y0, x1, y1] = hand.s;
      out.push({
        clientId: hand.clientId,
        name: hand.name,
        colour: hand.colour,
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      });
    }
    return out;
  }, [hands, clientId]);

  return { heldByOthers, marquees };
}
