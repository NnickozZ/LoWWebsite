'use client';

import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { KeeperSideMark } from './KeeperSideMark';

/**
 * §44/§45: the stamp at the top of a page that is the Keeper's own side.
 *
 * Two things at once, because they answer the same question at two speeds.
 * `KeeperSideMark` is the hidden marker §45's palette selectors look for, so
 * the whole page is painted in the Keeper's colours; the stamp is a word, and
 * a word is readable before anybody has learnt what the colours mean — and it
 * still says which face you are on if the palette is the default one.
 *
 * Rendered by a page that has already established, on the server, that the
 * record is keeper-only. It grants nothing and is read by nothing.
 */
export function KeeperStamp({ on = true }: { on?: boolean }) {
  const words = useUi().words;
  if (!on) return null;
  return (
    <>
      <KeeperSideMark />
      <p className="keeper-stamp" data-testid="keeper-stamp">
        <Icon name="shield" size={14} />
        {words.keeperSide}
      </p>
    </>
  );
}
