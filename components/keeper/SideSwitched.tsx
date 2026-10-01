'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useUi } from '@/components/ui/UiProvider';
import type { Side } from '@/lib/keeper/kinds';
import { readLanding, SWITCHED_PARAM, switchedMessage, TWINLESS_PARAM } from './flipRoad';

/**
 * §50/§57: the word for a wissel that has already happened.
 *
 * §46's `SideSync` did the correcting here, in the browser: a POST and a
 * `router.refresh()`. The correcting moved to the server in §50 (`sideDetour`)
 * and, in §57, so did the last road that was not on it — the toggle itself. So
 * all that is left here is the courtesy: say it. The page arrives with
 * `gewisseld=1` on its address, this toasts once, and the parameters are taken
 * off again so a refresh does not repeat it.
 *
 * §57: it lives in `AppShell` now rather than inside `KeeperStamp`. A flip
 * without a tweeling lands on a **list**, and no list renders a stamp — which
 * is why the sentence §50 wrote was never said on exactly the landing that
 * needed it most. One mount, in the shell, under every page.
 *
 * Nothing here grants or changes anything: by the time it runs the cookie, the
 * layout and the palette already agree, because a document load is what
 * brought us here.
 */
/*
 * Two mounts may be on screen at once — the shell's, under every page, and the
 * one a record page's `KeeperStamp` renders. Both are wanted: the shell's is
 * the only one on a list, and the record page's is the one that survives when
 * the shell's has not run. This is what keeps them from saying it twice, and
 * from being two different answers about the same landing.
 */
let saidFor: string | null = null;

/*
 * Golf O, vijfde pas (Nick: "Als ik iemand volg van de keeper side naar de
 * player side dan wordt de switch niet correct geplaatst, en moet ik 2x klikken
 * om terug te gaan"). *Ga naar* in *Wie is er?* is a `<Link>`, so following a
 * player across the border was a client-side navigation: the page sent it
 * through `sideDetour` and the cookie turned over, but the shell — the
 * switch, the palette, §48's born-on-a-side — was the layout's from before,
 * and still said Keeper. Every road that crosses the border has to be a
 * document load (§57); this one could not know beforehand that it would
 * cross. So the shell's copy, which is the only one that lives through a
 * client-side navigation, notices a *new* landing with the flag and loads the
 * same address again as a document, flag and all. That load says the
 * sentence; nothing is said before it.
 */
let reloading = false;
let reloadTo = '';

export function SideSwitched({ side }: { side: Side }) {
  const { toast, words } = useUi();
  /*
   * The flags are read **once**, on the first render, and then the address is
   * cleaned straight away — separately from the sentence. Taking them off used
   * to be the tail of the toast, which meant that anything keeping the toast
   * from being said left `?gewisseld=1` standing on the address, where it
   * survives a reload, a copied link and a Back. Reading first and cleaning
   * second is also why the two effects cannot race each other: by the time
   * either runs, what they need is already in a ref.
   */
  const landing = useRef<{ switched: boolean; twinless: boolean } | null>(null);
  const readFor = useRef<string | null>(null);
  const said = useRef(false);
  /*
   * Read once **per landing**, not once per mount — round 38's repair.
   *
   * This component lives in `AppShell` (§57), which never unmounts while the
   * browser stays in the archive, so a `useRef` filled on the first render is
   * filled for the rest of the session. That made the *first* address a browser
   * ever saw decide, for ever, whether a later `?gewisseld=1` was cleaned off:
   * land somewhere without the flag first, and the next wissel left it standing
   * — where, exactly as the note below warns, it survives a reload, a copied
   * link and a Back.
   *
   * It showed up as `keeper-side.spec.ts:59` failing in a full run and passing
   * alone (CLAUDE.md §1 called it a flake for two rounds), because whether the
   * first navigation of the run carried the flag is a matter of ordering.
   *
   * So the search string it was read for is remembered, and a *new* one that
   * carries the flag is read afresh. Only a landing that really is one can
   * reach this: a search string without the flag is not read, so nothing here
   * can clear the memory of a sentence already said. `said` is released with
   * it, because a second genuine wissel deserves its own sentence — and
   * `saidFor` below still holds it to once per page.
   */
  /*
   * The subscription that makes the re-read below possible at all. Without it
   * this component is rendered once per document load and never again: it takes
   * no prop that changes, so a *client-side* navigation (a `<Link>` into a
   * tweeling, which is how §50's detour usually arrives) re-renders the page
   * under it and leaves this untouched. The shell's copy therefore never saw
   * the landing, and the address kept `?gewisseld=1` — on a reload, on a copied
   * link, and on the Back button.
   */
  const params = useSearchParams();
  const pathname = usePathname();
  if (typeof window !== 'undefined') {
    /*
     * Golf O, vijfde pas: the router's own search, not `window.location`. On a
     * client-side navigation this renders *before* the router writes the new
     * address into history, so `window.location.search` was still the old one
     * and the landing was never seen at all.
     */
    const query = params?.toString() ?? '';
    const search = query ? `?${query}` : '';
    if (landing.current === null) {
      landing.current = readLanding(search);
      readFor.current = search;
    } else if (readFor.current !== search) {
      const next = readLanding(search);
      readFor.current = search;
      if (next.switched) {
        landing.current = next;
        said.current = false;
        reloading = true;
        reloadTo = `${pathname}${search}`;
      }
    }
  } else if (landing.current === null) {
    landing.current = { switched: false, twinless: false };
  }

  useEffect(() => {
    if (!reloading || typeof window === 'undefined') return;
    window.location.replace(reloadTo || window.location.href);
  });

  useEffect(() => {
    if (reloading || typeof window === 'undefined' || !landing.current?.switched) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SWITCHED_PARAM) && !url.searchParams.has(TWINLESS_PARAM)) return;
    url.searchParams.delete(SWITCHED_PARAM);
    url.searchParams.delete(TWINLESS_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  });

  useEffect(() => {
    if (reloading || said.current || !landing.current?.switched) return;
    said.current = true;
    const here = typeof window === 'undefined' ? '' : window.location.pathname;
    if (saidFor === here) return;
    saidFor = here;
    toast(switchedMessage(side, landing.current.twinless, words));
  }, [side, toast, words]);

  return null;
}
