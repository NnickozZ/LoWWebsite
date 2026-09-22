'use client';

import { useEffect, useState } from 'react';
import { useUi } from '@/components/ui/UiProvider';

type View = 'list' | 'cards';

const KEY = 'wiki:view';
/** The width under which the wiki opens as a list (the phone breakpoint of `globals.css`). */
const PHONE = '(max-width: 767px)';

/**
 * §92 (F31): Lijst of Kaarten, for the list of one soort in the wiki.
 *
 * On a phone the cards were 172 × 332 px, two abreast, so nine artikelen were
 * three screens of scrolling; a list with one line per artikel is what a phone
 * wiki opens with. The *default* is CSS (`.wiki-entries` under the phone
 * breakpoint), so the server's HTML is already right and nothing jumps when
 * this component wakes up; a choice made here is written on the grid as
 * `data-view` and remembered in this browser only — a convenience, not state.
 */
export function WikiViewToggle({ target }: { target: string }) {
  const { words } = useUi();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      /* private window: the default stands */
    }
    const chosen: View | null = stored === 'list' || stored === 'cards' ? stored : null;
    const grid = document.getElementById(target);
    if (chosen && grid) grid.setAttribute('data-view', chosen);
    setView(chosen ?? (window.matchMedia(PHONE).matches ? 'list' : 'cards'));
  }, [target]);

  const choose = (next: View) => {
    setView(next);
    document.getElementById(target)?.setAttribute('data-view', next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* not remembered, still shown */
    }
  };

  return (
    <div className="row wiki-view-toggle" role="group" aria-label={words.wikiViewLabel}>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        aria-pressed={view === 'list'}
        onClick={() => choose('list')}
      >
        {words.wikiViewList}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        aria-pressed={view === 'cards'}
        onClick={() => choose('cards')}
      >
        {words.wikiViewCards}
      </button>
    </div>
  );
}
