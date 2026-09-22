'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { orderPanes } from '@/lib/adminTabOrder';

export type AdminPane = {
  key: string;
  label: string;
  icon: string;
  /** Shown as a small count beside the label — the review queue uses it. */
  badge?: number;
  content: ReactNode;
};

/**
 * §11 asks for eight panes. One long scroll would bury the useful ones, so
 * they share the chip-strip idiom the case dossier already uses: one row that
 * wraps on a desktop and scrolls sideways on a phone. Every pane is rendered
 * on the server; this only chooses which one is on screen.
 */
export function AdminTabs({ panes: given }: { panes: AdminPane[] }) {
  const panes = orderPanes(given);
  // `/admin?tab=site` opens on that pane — the start page links there.
  const params = useSearchParams();
  const asked = params.get('tab');
  const [active, setActiveState] = useState(panes.some((pane) => pane.key === asked) ? asked! : (panes[0]?.key ?? ''));
  const current = panes.find((pane) => pane.key === active) ?? panes[0];
  /*
   * §90: and the choice is written back into the address, so a reload or a
   * Back lands on the same tab instead of on Gebruikers. `replaceState`, not
   * `router.replace`: every pane is already on the page, so asking the server
   * to render all ten again for a chip would be the slow way to change a
   * query string (the web and the search screen do the same; Next keeps
   * `useSearchParams` in step with it).
   */
  const setActive = useCallback((key: string) => {
    setActiveState(key);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      // §94: `null`, not `history.state` — Next's patched replaceState only adopts
      // the new address when the data carries no `__NA` (see lib/canvas/memory.ts).
      window.history.replaceState(null, '', next);
    }
  }, []);

  return (
    <>
      <div className="chip-strip" role="tablist" aria-label="Beheeronderdelen" style={{ margin: '0.8rem 0 1.2rem' }}>
        {panes.map((pane) => (
          <button
            key={pane.key}
            type="button"
            role="tab"
            aria-selected={pane.key === current?.key}
            className={`chip chip-selectable${pane.key === current?.key ? ' chip-active' : ''}`}
            onClick={() => setActive(pane.key)}
          >
            <Icon name={pane.icon} size={14} />
            {pane.label}
            {pane.badge ? <span className="admin-badge">{pane.badge}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={current?.label}>
        {current?.content}
      </div>
    </>
  );
}
