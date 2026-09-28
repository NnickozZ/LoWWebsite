'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useDismiss } from '@/components/ui/useDismiss';

export type MeerSoort = {
  slug: string;
  label: string;
  icon: string;
  colour: string;
  count: number;
  href: string;
  /** The rang from `rangSoorten`: a soort that the row shows at this width is hidden here (app/leeskamer.css). */
  rang: number;
};

/**
 * §104 (golf H, D6): *Meer soorten ▾* at the end of the wiki's one row of tabs.
 *
 * A popover, not a sheet (§69): the list stays live under it, a press outside
 * or Escape closes it (`useDismiss`), and the caret goes back to the button.
 * Each soort is a link with its count, in the Keeper's order; one with nothing
 * in it on this side is there and quiet, as in the row (`.is-leeg`).
 *
 * The panel hangs from `.type-tabs-rij`, outside the scrolling row, so the
 * row's `overflow` never clips it.
 */
export function MeerSoorten({
  label,
  items,
  nodigTot,
}: {
  label: string;
  items: MeerSoort[];
  nodigTot: number | null;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss({ open, onDismiss: close, ref: panel, opener: button });

  return (
    <div className="meer-soorten" ref={panel} data-nodig-tot={nodigTot ?? undefined}>
      <button
        type="button"
        ref={button}
        className="type-tab meer-soorten-knop"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        aria-controls="meer-soorten-lijst"
        data-testid="meer-soorten"
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="layers" size={14} />
        <span className="meer-soorten-woord">{label}</span>
        <Icon name="chevron" size={12} className="meer-soorten-pijl" />
      </button>
      {open && (
        <ul className="meer-soorten-lijst" id="meer-soorten-lijst" aria-label={label}>
          {items.map((item) => (
            <li key={item.slug} data-rang={item.rang}>
              <Link
                className={`type-tab meer-soorten-item${item.count ? '' : ' is-leeg'}`}
                href={item.href}
                onClick={close}
              >
                <Icon name={item.icon} size={14} className="soort-inkt" style={{ ['--soort' as string]: item.colour }} />
                <span className="meer-soorten-naam">{item.label}</span>
                <span className="type-tab-count">{item.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
