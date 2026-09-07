'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
 * the colours mean; and `SideSync` (below) tells the *browser* which side it
 * is now standing on, so the next list opened is the same side as this page.
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
  /** The side the browser's cookie says, as the layout read it. Omit for a page that should not move it. */
  browserSide?: Side;
  /** Where the toggle goes from here. */
  flipTo?: string;
  /**
   * §46: the visible word. Off for a page whose own heading already says it is
   * the Keeper's — Beheer — which still needs the mark and the cookie sync.
   */
  stamp?: boolean;
}) {
  const words = useUi().words;
  const resolved: Side = side ?? (on ? 'keeper' : 'player');
  return (
    <>
      <KeeperSideMark side={resolved} flipTo={flipTo} />
      {browserSide && <SideSync side={resolved} browserSide={browserSide} />}
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
 * §46: the quiet road. A Keeper who followed a touwtje across is now standing
 * on the other side; the page already looks right (the mark above did that
 * on the server), so all that is left is to tell the cookie, and to re-read
 * the shell so the toggle and the masthead agree with the page. No redirect,
 * no flash — one POST and one refresh, only when the two actually differ.
 */
function SideSync({ side, browserSide }: { side: Side; browserSide: Side }) {
  const router = useRouter();
  useEffect(() => {
    if (side === browserSide) return;
    let cancelled = false;
    fetch('/api/keeper/flip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ side }),
    })
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [side, browserSide, router]);
  return null;
}
