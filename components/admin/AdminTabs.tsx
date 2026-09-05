'use client';

import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';

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
export function AdminTabs({ panes }: { panes: AdminPane[] }) {
  // `/admin?tab=site` opens on that pane — the start page links there.
  const params = useSearchParams();
  const asked = params.get('tab');
  const [active, setActive] = useState(panes.some((pane) => pane.key === asked) ? asked! : (panes[0]?.key ?? ''));
  const current = panes.find((pane) => pane.key === active) ?? panes[0];

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
