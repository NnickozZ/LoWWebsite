'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { Side } from '@/lib/keeper/kinds';
import { KeeperSideMark } from './KeeperSideMark';

/**
 * §44/§45/§46: the stamp at the top of a page that is the Keeper's own side —
 * and, for every record page, the mark that says which side it is on.
 *
 * Three things at once, because they answer the same question at three speeds.
 * `KeeperSideMark` is the hidden marker §45's palette selectors look for, so
 * the whole page is painted in the right side's colours before a single
 * script runs; the stamp is a word, readable before anybody has learnt what
 * the colours mean; and `SideSwitched` (below) says, once, that the whole site
 * has just turned over with you.
 *
 * §50: the browser's cookie is no longer corrected from here. `sideDetour()`
 * does it on the server before the page renders, so by the time any of this
 * runs the shell, the palette and this mark already agree.
 *
 * Rendered by a page that has already established, on the server, which side
 * the record is on. It grants nothing and is read by nothing but the toggle.
 */
export function KeeperStamp({
  side,
  on,
  browserSide,
  flipTo,
  stamp = true,
}: {
  /** Which side this record is on. `on` is the older spelling of side='keeper'. */
  side?: Side;
  on?: boolean;
  /** §50: set when this reader is a Keeper — the only one who is ever switched, and so the only one told about it. */
  browserSide?: Side;
  /** Where the toggle goes from here. */
  flipTo?: string;
  /**
   * §46: the visible word. Off for a page whose own heading already says it is
   * the Keeper's — Beheer — which still needs the mark.
   */
  stamp?: boolean;
}) {
  const words = useUi().words;
  const resolved: Side = side ?? (on ? 'keeper' : 'player');
  return (
    <>
      <KeeperSideMark side={resolved} flipTo={flipTo} />
      {/* §50: only a Keeper is ever wisseld, and only a Keeper's page is given
          a `browserSide` — so that prop stays the "this reader can move" bit
          even though the moving itself happens on the server now. */}
      {browserSide && <SideSwitched side={resolved} />}
      {stamp && resolved === 'keeper' && (
        <p className="keeper-stamp" data-testid="keeper-stamp">
          <Icon name="shield" size={14} />
          {words.keeperSide}
        </p>
      )}
    </>
  );
}

/**
 * §50: the word for a wissel that has already happened.
 *
 * §46's `SideSync` did the correcting here, in the browser: a POST and a
 * `router.refresh()`. The refresh is what made the UI go strange — the shell
 * came back a beat after the page, so the palette, the toggle and the masthead
 * flipped mid-view, and until they did every picker on screen had been built
 * for the side the person had just left. The correcting is now `sideDetour()`
 * on the server, before a single element is drawn.
 *
 * What is left is the courtesy: say it. The page arrives with `gewisseld=1` on
 * its address, this toasts once, and the parameter is taken off again so a
 * refresh does not repeat it. Nothing here grants or changes anything — by the
 * time it runs the cookie already agrees with the page.
 */
function SideSwitched({ side }: { side: Side }) {
  const router = useRouter();
  const { toast, words } = useUi();
  // `router.replace` does not take the parameter off the address instantly, so
  // a re-render in between would toast twice. Said once, per landing.
  const said = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || said.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('gewisseld') !== '1') return;
    said.current = true;
    toast(`Je staat nu aan de ${side === 'keeper' ? words.keeperSide : words.playerSide}.`);
    url.searchParams.delete('gewisseld');
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [side, toast, words, router]);
  return null;
}
