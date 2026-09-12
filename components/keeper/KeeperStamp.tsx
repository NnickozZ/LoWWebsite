'use client';

import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { Side } from '@/lib/keeper/kinds';
import { KeeperSideMark } from './KeeperSideMark';
import { SideSwitched } from './SideSwitched';

/**
 * §44/§45/§46: the stamp at the top of a page that is the Keeper's own side —
 * and, for every record page, the mark that says which side it is on.
 *
 * Two things at once, because they answer the same question at two speeds.
 * `KeeperSideMark` is the hidden marker §45's palette selectors look for, so
 * the whole page is painted in the right side's colours before a single
 * script runs; and the stamp is a word, readable before anybody has learnt
 * what the colours mean.
 *
 * §50: the browser's cookie is no longer corrected from here. `sideDetour()`
 * does it on the server before the page renders, so by the time any of this
 * runs the shell, the palette and this mark already agree.
 *
 * §57: and the *saying* of it is no longer here either. `SideSwitched` moved
 * to `AppShell`: a flip with no tweeling lands on a list, and a list renders
 * no stamp, so the one landing that most needed a word was the one that never
 * got it. With it went `browserSide` — the shell knows which side this browser
 * stands on without a record page telling it.
 *
 * Rendered by a page that has already established, on the server, which side
 * the record is on. It grants nothing and is read by nothing but the toggle.
 */
export function KeeperStamp({
  side,
  on,
  flipTo,
  flipList,
  stamp = true,
}: {
  /** Which side this record is on. `on` is the older spelling of side='keeper'. */
  side?: Side;
  on?: boolean;
  /** Where the toggle goes from here: the tweeling, when this thing has one. */
  flipTo?: string;
  /** §57: and the list it falls back to when it has not. */
  flipList?: string;
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
      <KeeperSideMark side={resolved} flipTo={flipTo} flipList={flipList} />
      {/* §57: the shell carries one of these too, and it is the only one a
          list gets. This second mount is for a record page, whose own
          rendering is the thing that arrived — under load the shell's was not
          always the one that ran, and the flags then stayed on the address
          where they survive a reload and a copied link. They coordinate
          through one module-level "already said" so nobody hears it twice. */}
      <SideSwitched side={resolved} />
      {stamp && resolved === 'keeper' && (
        <p className="keeper-stamp" data-testid="keeper-stamp">
          <Icon name="shield" size={14} />
          {words.keeperSide}
        </p>
      )}
    </>
  );
}
