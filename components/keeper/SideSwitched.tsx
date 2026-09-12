'use client';

import { useEffect, useRef } from 'react';
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
  if (landing.current === null) {
    landing.current =
      typeof window === 'undefined' ? { switched: false, twinless: false } : readLanding(window.location.search);
  }
  const said = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !landing.current?.switched) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SWITCHED_PARAM) && !url.searchParams.has(TWINLESS_PARAM)) return;
    url.searchParams.delete(SWITCHED_PARAM);
    url.searchParams.delete(TWINLESS_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  });

  useEffect(() => {
    if (said.current || !landing.current?.switched) return;
    said.current = true;
    const here = typeof window === 'undefined' ? '' : window.location.pathname;
    if (saidFor === here) return;
    saidFor = here;
    toast(switchedMessage(side, landing.current.twinless, words));
  }, [side, toast, words]);

  return null;
}
