'use client';

import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import type { Words } from '@/lib/words';

/**
 * §44: "kijk als speler" — the way in, and the way back.
 *
 * The preview works by *becoming* a player: `getSessionUser` turns `isKeeper`
 * off for the whole request, so every read, every room and every API answers
 * the way it would for the table. That is the point, and it is also the
 * problem this banner solves — Beheer and the Keeperkant refuse to render
 * while it is on, so the control that turns it off cannot live on either.
 *
 * It stands in the shell, above the page, outside anything that can throw: the
 * shell survives a page that fails (`app/(app)/error.tsx`), so a Keeper who
 * lands somewhere broken with the preview on still has the way out on screen.
 *
 * Both controls are plain `<a>` rather than `Link`: the address is a route
 * handler that sets a cookie and redirects, not a page to prefetch.
 */

export function AsPlayerBanner({ on, words }: { on: boolean; words: Words }) {
  const pathname = usePathname();
  if (!on) return null;
  const back = `/api/keeper/as-player?on=0&to=${encodeURIComponent(pathname || '/')}`;
  return (
    <p className="author-banner keeper-as-player" role="status" data-testid="as-player-banner">
      <Icon name="eye" size={16} />
      <span>
        <strong>Je kijkt als {words.player}.</strong> Je ziet nu precies wat de {words.playerPlural}{' '}
        zien — niets van de {words.keeperSide}, en schrijven gaat niet.{' '}
        <a href={back} data-testid="as-player-stop">
          Stop met kijken als {words.player}
        </a>
        .
      </span>
    </p>
  );
}

/** The way in, in the side menu, under who you are being. Real Keepers only. */
export function AsPlayerLink({ show, words }: { show: boolean; words: Words }) {
  const pathname = usePathname();
  if (!show) return null;
  return (
    <a
      className="tiny muted who-as-player"
      href={`/api/keeper/as-player?on=1&to=${encodeURIComponent(pathname || '/')}`}
      data-testid="as-player-start"
    >
      <Icon name="eye" size={13} />
      {words.asPlayer}
    </a>
  );
}
